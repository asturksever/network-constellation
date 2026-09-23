// Research one person on the web, on request.
//
// This is the one place a person's NAME leaves the browser, and it is the only
// way to research someone on the web at all. So it never runs on its own: a
// button on the panel, with the cost and the payload stated on it, and the
// result cached so a person is researched once.
//
// The payload is built by researchPayload() below and is exactly: name,
// headline, employer name, and the employer facts already known locally. No
// profile link, no email.

import { callClaudeWithSearch, mock } from './llm.js';
import { getResearch, putResearch } from './store.js';

/** A short stable hash for cache keys. */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export const MODEL_RESEARCH = 'claude-opus-5';
export const RESEARCH_MAX_SEARCHES = 8;

export const RESEARCH_HEADINGS = ['Identity', 'Organisation', 'Role', 'Track record', 'Signals', 'Approach'];

/** Everything that is sent. The name is included, deliberately and visibly. */
export function researchPayload(p, employer) {
  return {
    name: p.name || '',
    headline: p.headline || '',
    company: p.company || '',
    employer: employer
      ? { hqCity: employer.hqCity, hqCountry: employer.hqCountry, orgType: employer.orgType, industry: employer.industry }
      : null
  };
}

export const researchKey = p =>
  'r:' + fnv1a(`${p.name || ''}\n${p.headline || ''}\n${p.company || ''}`);

export const RESEARCH_SYSTEM = `You are researching one professional contact on behalf of someone deciding whether and how to reach out to them. You have web search. Work in this order and do not skip a step.

1. **Identify.** You are given a name, a headline and an employer from LinkedIn. Search for the person together with the employer and a distinctive word from the headline. Establish that the pages you find are this person and not a namesake: matching employer, matching role or field, matching location if one appears. If you cannot establish identity with reasonable confidence, say so at the top, keep only what is certain, and stop after step 3. A confident brief about the wrong person is the worst possible outcome.
2. **Organisation.** What the employer does in one or two sentences, size and stage if findable, headquarters, and news from the last twelve months: funding, launches, layoffs, acquisitions, leadership changes.
3. **Role.** What this person's role most likely involves day to day, given the title and the organisation. Separate what you found from what you infer.
4. **Track record.** Prior roles and employers, education if public, and what they have made public: talks, papers, articles, open-source work, interviews, podcasts. Prefer the last three years.
5. **Signals.** What they seem to care about professionally right now: recent posts or talks, topics they return to, communities they are part of.
6. **Approach.** Three specific things the reader could open a conversation with, each grounded in something found above. Not compliments.
7. **Photo.** If a page that is clearly about this person carries a professional photo of them — a company team page, a conference speaker page, a personal site, a university staff page — give the direct image URL. Only a URL that ends in an image, only from a public page that needs no login, and only when you are confident it is this person. Otherwise say none.

Rules. Cite a source for every factual claim; anything uncited is an inference and must say so. Report nothing from private life: no home address, personal contact details, family, health, religion, politics. Do not pad; a section with nothing solid is one line saying so. Plain, direct English. Use exactly these headings, each on its own line: **Identity**, **Organisation**, **Role**, **Track record**, **Signals**, **Approach**, then a line \`Confidence: high | medium | low\` and one sentence on why, and a last line \`Photo: <direct image URL>\` or \`Photo: none\`.`;

function userText(payload) {
  const lines = [
    `Name: ${payload.name}`,
    `Headline: ${payload.headline || '(none)'}`,
    `Employer: ${payload.company || '(none stated)'}`
  ];
  const e = payload.employer;
  if (e) {
    const facts = [];
    const where = [e.hqCity, e.hqCountry].filter(Boolean).join(', ');
    if (where) facts.push(`headquartered in ${where}`);
    if (e.orgType && e.orgType !== 'unknown') facts.push(`a ${e.orgType}`);
    if (e.industry) facts.push(`industry: ${e.industry}`);
    if (facts.length) lines.push(`Already known about the employer (no need to search for this): ${facts.join('; ')}.`);
  }
  return lines.join('\n');
}

/**
 * Split the brief into its sections. Tolerant of the heading being bold,
 * plain, or a markdown heading; anything before the first heading is kept as
 * a preamble (this is where "I could not confirm identity" lands).
 */
export function parseBrief(text) {
  const sections = {};
  let current = 'preamble';
  sections[current] = [];
  let confidence = '';
  let photo = '';
  const headingRe = new RegExp(`^\\s*(?:#+\\s*)?\\**\\s*(${RESEARCH_HEADINGS.join('|')})\\s*\\**\\s*:?\\s*$`, 'i');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const h = line.match(headingRe);
    if (h) {
      current = RESEARCH_HEADINGS.find(x => x.toLowerCase() === h[1].toLowerCase());
      sections[current] = sections[current] || [];
      continue;
    }
    const c = line.match(/^\s*\**\s*confidence\s*\**\s*:\s*\**\s*(high|medium|low)\**\s*(.*)$/i);
    if (c) { confidence = c[1].toLowerCase(); sections.confidenceWhy = c[2].replace(/^[\s\u2014\u2013:.-]+/, '').trim(); continue; }
    const ph = line.match(/^\s*\**\s*photo\s*\**\s*:\s*\**\s*(\S+)/i);
    if (ph) { photo = /^https:\/\/\S+\.(?:jpe?g|png|webp|gif)(?:\?\S*)?$/i.test(ph[1]) ? ph[1] : ''; continue; }
    sections[current].push(line);
  }
  for (const k of Object.keys(sections)) {
    if (Array.isArray(sections[k])) sections[k] = sections[k].join('\n').trim();
  }
  return { sections, confidence, photo };
}

/**
 * Cached brief if there is one, otherwise research. Resolves the record with a
 * `cached` flag. `force` bypasses the cache for "Research again".
 */
export async function researchPerson({ apiKey, model = MODEL_RESEARCH, person, employer, signal, force = false }) {
  const key = researchKey(person);
  if (!force) {
    const cached = await getResearch(key);
    if (cached) return { ...cached, cached: true };
  }

  const payload = researchPayload(person, employer);
  const fake = mock();
  let out;
  if (fake?.research) {
    out = await fake.research(payload);
  } else {
    out = await callClaudeWithSearch({
      apiKey, model,
      system: RESEARCH_SYSTEM,
      user: userText(payload),
      maxUses: RESEARCH_MAX_SEARCHES,
      signal
    });
  }

  const { confidence, photo } = parseBrief(out.text);
  const record = {
    key,
    text: out.text,
    photo: photo || '',
    sources: out.sources || [],
    searchErrors: out.searchErrors || [],
    confidence: confidence || 'low',
    searches: out.usage?.server_tool_use?.web_search_requests || 0,
    cost: out.cost || 0,
    model,
    researchedAt: Date.now()
  };
  await putResearch(record).catch(() => { /* a full store just means no cache */ });
  return { ...record, cached: false };
}
