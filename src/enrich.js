// Employer names -> headquarters and organisation type.
//
// The LinkedIn export has no location and no company type, so "any VC based in
// SF?" is unanswerable from it. This asks Claude, and it sends EMPLOYER NAMES
// AND NOTHING ELSE — no person's name, headline, profile link or email. That
// restriction is the whole privacy story, so the payload is assembled here from
// a list of strings and never from a person object.
//
// What comes back is inference, not lookup. A thirteen-character employer name
// is often ambiguous, so the model is told to answer null rather than guess,
// and every record carries its own confidence.

import { callClaude, costOf, MODEL_EMPLOYERS, LlmError, mock } from './llm.js';
import { putEmployers } from './store.js';

const BATCH = 40;
const CONCURRENCY = 3;

export const REGIONS = [
  'North America', 'Latin America', 'Europe', 'Middle East', 'Africa',
  'South Asia', 'East Asia', 'Southeast Asia', 'Oceania'
];

export const ORG_TYPES = [
  'company', 'startup', 'venture capital firm', 'university',
  'research institute', 'government', 'nonprofit', 'consultancy', 'unknown'
];

/** The join between a person's company string and a stored record. */
export const normKey = name =>
  (name || '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/[.,;:]+$/, '');

const nullable = extra => ({ anyOf: [{ type: 'string', ...extra }, { type: 'null' }] });

const EMPLOYER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['employers'],
  properties: {
    employers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'hqCity', 'hqCountry', 'hqCountryCode', 'region', 'industry', 'orgType', 'confidence'],
        properties: {
          name: { type: 'string' },
          hqCity: nullable(),
          hqCountry: nullable(),
          hqCountryCode: nullable(),
          region: { anyOf: [{ type: 'string', enum: REGIONS }, { type: 'null' }] },
          industry: nullable(),
          orgType: { type: 'string', enum: ORG_TYPES },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
        }
      }
    }
  }
};

const EMPLOYER_SYSTEM = `You label organisations from a list of employer names taken from someone's professional contacts.

For each name return:
- hqCity, hqCountry and hqCountryCode (ISO alpha-2) for the organisation's headquarters
- region, from the fixed list
- industry, a short plain description
- orgType, from the fixed list
- confidence in your identification

Rules:
- Return exactly one entry per input name, in the same order, echoing the name back unchanged.
- Names are often abbreviated, misspelt, or shared by several unrelated organisations. When you are not reasonably sure which one is meant, use null for the facts you cannot place and set confidence to low. A null is far more useful here than a plausible guess.
- Use confidence high only for organisations you can identify unambiguously.
- "venture capital firm" covers VC funds and firms whose business is venture investing. A bank, a PE firm or a corporate venture arm of a larger company is not one unless venture investing is what the organisation is.`;

/**
 * Every employer worth asking about, hubs first so a partial run covers the
 * biggest clusters.
 */
export function employerList(D, people, { hubsOnly = false } = {}) {
  const seen = new Map();
  for (const name of D.comps) seen.set(normKey(name), name);
  if (!hubsOnly) {
    for (const p of people) {
      if (p.company && !seen.has(normKey(p.company))) seen.set(normKey(p.company), p.company);
    }
  }
  return [...seen.entries()].map(([key, name]) => ({ key, name }));
}

/** Roughly what a run will cost, from measured token use per batch. */
export function estimate(count, model = MODEL_EMPLOYERS) {
  const batches = Math.ceil(count / BATCH);
  const usage = { input_tokens: batches * 900, output_tokens: count * 55 };
  return { batches, dollars: costOf(model, usage), seconds: Math.ceil((batches / CONCURRENCY) * 15) };
}

async function labelBatch({ apiKey, model, names, signal }) {
  const fake = mock();
  if (fake) return fake(names);

  try {
    const { data, usage } = await callClaude({
      apiKey,
      model,
      system: EMPLOYER_SYSTEM,
      user: JSON.stringify(names),
      schema: EMPLOYER_SCHEMA,
      maxTokens: 4096,
      signal
    });
    return { employers: data.employers || [], usage };
  } catch (err) {
    // A batch that overran its token ceiling is split rather than lost.
    if (err instanceof LlmError && (err.code === 'truncated' || err.code === 'too_large') && names.length > 4) {
      const mid = Math.ceil(names.length / 2);
      const a = await labelBatch({ apiKey, model, names: names.slice(0, mid), signal });
      const b = await labelBatch({ apiKey, model, names: names.slice(mid), signal });
      return {
        employers: [...a.employers, ...b.employers],
        usage: {
          input_tokens: (a.usage?.input_tokens || 0) + (b.usage?.input_tokens || 0),
          output_tokens: (a.usage?.output_tokens || 0) + (b.usage?.output_tokens || 0)
        }
      };
    }
    throw err;
  }
}

/**
 * Label every employer in `jobs`, writing results to storage as each batch
 * lands so that cancelling keeps whatever it got.
 *
 * onProgress({ done, total, dollars }) is called after every batch.
 */
export async function enrichEmployers({
  apiKey, model = MODEL_EMPLOYERS, jobs, signal, onProgress, onRecords
}) {
  const batches = [];
  for (let i = 0; i < jobs.length; i += BATCH) batches.push(jobs.slice(i, i + BATCH));

  let done = 0;
  let dollars = 0;
  let next = 0;
  const failures = [];

  const worker = async () => {
    while (next < batches.length) {
      if (signal?.aborted) return;
      const batch = batches[next++];
      const byKey = new Map(batch.map(j => [normKey(j.name), j]));

      let out;
      try {
        out = await labelBatch({ apiKey, model, names: batch.map(j => j.name), signal });
      } catch (err) {
        if (err instanceof LlmError && (err.code === 'auth' || err.code === 'cancelled')) throw err;
        failures.push(err);
        done += batch.length;
        onProgress?.({ done, total: jobs.length, dollars });
        continue;
      }

      const records = [];
      for (const e of out.employers) {
        const job = byKey.get(normKey(e.name));
        if (!job) continue;              // a name we did not ask about
        records.push({
          key: job.key,
          name: job.name,
          hqCity: e.hqCity || null,
          hqCountry: e.hqCountry || null,
          hqCountryCode: e.hqCountryCode || null,
          region: e.region || null,
          industry: e.industry || null,
          orgType: e.orgType || 'unknown',
          confidence: e.confidence || 'low',
          model,
          enrichedAt: Date.now()
        });
      }

      await putEmployers(records);
      onRecords?.(records);

      dollars += costOf(model, out.usage);
      done += batch.length;
      onProgress?.({ done, total: jobs.length, dollars });
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
  return { done, dollars, failures, cancelled: Boolean(signal?.aborted) };
}
