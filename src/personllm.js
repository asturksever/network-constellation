// Claude's read of one person, from their headline alone.
//
// This is the one place per-person text leaves the browser, and it does so
// only when the user has saved a key and left "ask Claude about each person I
// click" switched on. What goes out is built by personPayload() below and is
// exactly: role, headline, employer name, and the employer's already-known
// facts. The person's name, profile slug and email are not fields of that
// object, so they cannot travel by accident.
//
// Reads are cached by a hash of the text sent, so clicking the same person
// twice costs nothing and a rebuilt file finds its earlier reads again.

import { callClaude, costOf, mock } from './llm.js';
import { getPerson, putPerson } from './store.js';

/** Fired automatically per click, so the cheap model — it is a bulk read. */
export const MODEL_PERSON = 'claude-haiku-4-5';

const SENIORITY_READS = [
  'founder or executive', 'senior leader', 'manager or lead',
  'senior individual contributor', 'individual contributor',
  'student or early career', 'unclear'
];

export function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Everything that is sent. Deliberately has no name, slug or email field. */
export function personPayload(p, employer) {
  return {
    role: p.role || '',
    headline: p.headline || '',
    company: p.company || '',
    employer: employer
      ? { hqCity: employer.hqCity, hqCountry: employer.hqCountry, orgType: employer.orgType, industry: employer.industry }
      : null
  };
}

export const personKey = p => 'p:' + fnv1a(`${p.role || ''}\n${p.headline || ''}\n${p.company || ''}`);

const personStrings = () => ({ type: 'array', items: { type: 'string' } });

const PERSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'likelyWorksOn', 'couldHelpWith', 'seniorityRead', 'confidence'],
  properties: {
    summary: { type: 'string' },
    likelyWorksOn: personStrings(),
    couldHelpWith: personStrings(),
    seniorityRead: { type: 'string', enum: SENIORITY_READS },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
  }
};

const PERSON_SYSTEM = `You read one professional headline from someone's contact list and say, briefly, what this person most likely does.

You are given: their role, their full headline, their employer's name, and — when known — that employer's headquarters, type and industry. Headlines are self-descriptions, often terse or promotional. Work only from what is there.

Return:
- summary: one plain sentence on what they do, written for someone deciding whether to reach out. No flattery, no filler.
- likelyWorksOn: up to five short topics they plausibly work on, most specific first.
- couldHelpWith: up to four concrete things a contact could reasonably ask them about.
- seniorityRead: your read of their level, from the fixed list.
- confidence: high only when the headline is specific and unambiguous.

Never guess at anything the text does not support: not their name, nationality, gender, age, location, or employer facts you were not given. If the headline is vague, say so in the summary and set confidence low.`;

/**
 * Cached read if there is one, otherwise ask. Resolves the stored record with
 * a `cached` flag, so the panel can say whether this click cost anything.
 */
export async function readPerson({ apiKey, model = MODEL_PERSON, person, employer, signal }) {
  const key = personKey(person);
  const cached = await getPerson(key);
  if (cached) return { ...cached, cached: true };

  const payload = personPayload(person, employer);
  const fake = mock();
  let data, usage;
  if (fake?.person) {
    ({ data, usage } = fake.person(payload));
  } else {
    ({ data, usage } = await callClaude({
      apiKey, model,
      system: PERSON_SYSTEM,
      user: JSON.stringify(payload),
      schema: PERSON_SCHEMA,
      maxTokens: 600,
      signal
    }));
  }

  const record = {
    key,
    summary: data.summary || '',
    likelyWorksOn: (data.likelyWorksOn || []).slice(0, 5),
    couldHelpWith: (data.couldHelpWith || []).slice(0, 4),
    seniorityRead: data.seniorityRead || 'unclear',
    confidence: data.confidence || 'low',
    model,
    readAt: Date.now(),
    cost: costOf(model, usage)
  };
  await putPerson(record).catch(() => { /* a full store just means no cache */ });
  return { ...record, cached: false };
}
