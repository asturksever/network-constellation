// Reading a question more carefully than the regexes can.
//
// What is sent: the question text, and nothing else. Not the corpus, not a
// single person. That is the design claim in docs/ask-your-graph.md and it
// stays true — the model writes the query, it never reads the network.
//
// Everything that comes back is checked against the taxonomy before it is
// used, and recorded separately so describe() can show which constraints came
// from Claude rather than from the regexes.

import { callClaude, MODEL_QUESTION, mock } from './llm.js';
import { DOMAIN_NAMES, FACETS, mergeFilter } from './ask.js';
import { ORG_TYPES, REGIONS } from './enrich.js';

const strings = () => ({ type: 'array', items: { type: 'string' } });

const QUESTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['location', 'orgTypes', 'domains', 'facets', 'synonyms', 'interpretation'],
  properties: {
    location: {
      type: 'object',
      additionalProperties: false,
      required: ['cities', 'countries', 'countryCodes', 'regions'],
      properties: {
        cities: strings(),
        countries: strings(),
        countryCodes: strings(),
        regions: { type: 'array', items: { type: 'string', enum: REGIONS } }
      }
    },
    orgTypes: { type: 'array', items: { type: 'string', enum: ORG_TYPES } },
    domains: strings(),
    facets: strings(),
    synonyms: strings(),
    interpretation: { type: 'string' }
  }
};

function questionSystem() {
  return `You turn a question about someone's professional contacts into a structured filter. You never answer the question — you have not seen the contacts, and you never will.

Pick domains only from this list, exactly as written:
${DOMAIN_NAMES.join('\n')}

Pick facets only from this list, exactly as written:
${FACETS.map(f => f[0]).join('\n')}

Rules:
- domains: the fields the question is about. Leave empty if the question names no field.
- facets: the job function asked for, if any.
- synonyms: words a person might actually put in their headline for this, that the question does not already use. Distinctive words only — no generic ones like "experience" or "professional". At most six.
- location: where the question wants the ORGANISATION to be. Expand abbreviations and metro areas into the cities someone would write ("SF" becomes San Francisco, and the nearby cities a headline might name instead). Use ISO alpha-2 for countryCodes. Leave every list empty if the question names no place.
- orgTypes: the kind of organisation, if the question implies one. "VC" or "venture capital" means venture capital firm.
- interpretation: one short sentence, in plain English, saying what you understood the question to ask for.

Add nothing that the question does not support. A filter that is too wide is worse than one that is too narrow, because the person reading the results already knows these people and will spot a miss faster than a flood.`;
}

/**
 * Question in, filter extension out. Throws whatever llm.js throws; the caller
 * treats failure as "no extension" rather than as a broken feature, because
 * the regex filter has already produced an answer by then.
 */
export async function understandQuestion({ apiKey, model = MODEL_QUESTION, question, signal }) {
  const fake = mock();
  if (fake) return fake.question ? fake.question(question, { signal }) : null;

  const { data, usage } = await callClaude({
    apiKey,
    model,
    system: questionSystem(),
    user: question,
    schema: QUESTION_SCHEMA,
    maxTokens: 1024,
    effort: 'low',
    signal
  });

  const known = new Set(DOMAIN_NAMES);
  const facetNames = new Set(FACETS.map(f => f[0]));

  return {
    ext: {
      location: data.location || null,
      orgTypes: (data.orgTypes || []).filter(t => ORG_TYPES.includes(t)),
      domains: (data.domains || []).filter(d => known.has(d)),
      facets: (data.facets || []).filter(f => facetNames.has(f)),
      synonyms: data.synonyms || []
    },
    interpretation: data.interpretation || '',
    usage
  };
}

/** Convenience: base filter plus whatever Claude read, already validated. */
export function applyUnderstanding(base, understanding) {
  return understanding ? mergeFilter(base, understanding.ext) : base;
}
