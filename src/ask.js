// Ask-your-graph: a question in, a shortlist of people out.
//
// THE DESIGN CLAIM
// The model writes the query; it never reads the corpus. A question resolves to
// a structured filter, the filter runs locally over classified rows, and only
// the ~20 survivors are ever candidates for an LLM to rank. That is two small
// calls instead of a million-token read — and it means the whole thing runs in
// a browser tab with the contact list never leaving the machine.
//
// THE PART THAT MAKES IT WORK OFFLINE
// taxonomy.js is bidirectional. The same regex that recognises "Satellite Image
// Sales Manager" in a headline recognises "satellite imagery licensing sales" in
// a question. So the default path needs no model and no API key at all: the
// taxonomy IS the query expander. An LLM is an optional upgrade for phrasing the
// taxonomy misses and for writing the reason lines — never a dependency.
//
// Every resolved query is human-readable on purpose (see describe()). The user
// knows these people; if the shortlist is wrong they will spot it instantly, and
// showing the query is what lets them correct it instead of leaving.

import { DOMAINS, DOM_EXTRA, DOM_TIER2, SENIORITY, SEN_ORDER } from './taxonomy.js';

/**
 * The taxonomy has one flat list, but questions treat two kinds of domain
 * differently. "Satellite imagery licensing sales" names a SUBJECT (Earth
 * Observation) and a FUNCTION (sales) — and it means the intersection, not the
 * union. OR-ing them returns every salesperson you know, which was the first
 * thing this prototype got wrong.
 */
export const FUNCTION_DOMAINS = new Set([
  'Sales, BD & Marketing', 'Product & Program', 'Software & Cloud',
  'Data Engineering & Analytics', 'Recruitment & HR', 'General management',
  'Consulting & Prof. Services', 'Engineering (other)', 'Design, Media & Content',
  'Legal & Compliance', 'Finance & Accounting', 'Operations & Manufacturing'
]);

/** Cross-cutting job functions. Orthogonal to domain: a person has one domain, but "sales" cuts across all of them. */
export const FACETS = [
  ['sells or does BD',   /\b(sales|selling|sell|business development|\bbd\b|licens\w*|partnership|reseller|channel|commercial|revenue|account (exec|manager|director)|go[- ]to[- ]market|gtm)\b/i],
  ['builds',             /\b(engineer\w*|develop\w*|build\w*|coding|software|technical|architect)\b/i],
  ['researches',         /\b(research\w*|academic|professor|phd|paper|publish\w*|study|studies|scientist)\b/i],
  ['leads or founded',   /\b(founder|found\w*|ceo|cto|chief|vp|head|director|lead\w*|exec\w*|boss|owner|partner)\b/i],
  ['hires',              /\b(recruit\w*|hiring|hire|talent|headhunt\w*)\b/i],
  ['does product',       /\b(product|\bpm\b|program|roadmap|discovery)\b/i],
  ['works in government',/\b(government|public sector|municipal|council|ministry|civil service|city of|policy)\b/i],
  ['invests',            /\b(invest\w*|\bvc\b|venture|fund|angel|capital)\b/i],
  ['consults',           /\b(consult\w*|advis\w*|freelance|contractor)\b/i]
];

const STOP = new Set(('who do i know does anyone any my in at the a an of for on with to is are that which what where can could' +
  ' help me find looking look need want know knows working work works someone somebody people person contact contacts network' +
  ' and or from get introduce introduction intro warm about please would should might there here best good top some').split(/\s+/));

/**
 * Questions use plurals where headlines use singulars ("founders" vs "Founder"),
 * and the taxonomy is tuned for headlines. Normalise toward the headline form.
 */
function normalise(q) {
  return ' ' + q.toLowerCase()
    .replace(/[^\p{L}\p{N}\s&/+-]/gu, ' ')
    .replace(/\b(\w{4,}?)(ies)\b/gu, '$1y')
    .replace(/\b(\w{4,}?)(ses|xes|zes|ches|shes)\b/gu, '$1s')
    .replace(/\b(\w{4,}?)s\b/gu, '$1')
    .replace(/\s+/g, ' ')
    .trim() + ' ';
}

/** Question -> structured filter. No network, no model, no key. */
export function resolveQuery(question) {
  // match against both forms: the taxonomy is tuned for headline text, but some
  // terms only survive in the raw question
  const raw = ' ' + question.toLowerCase() + ' ';
  const norm = normalise(question);
  const hits = re => re.test(raw) || re.test(norm);

  const domains = [];
  for (const [name, re] of DOMAINS) if (hits(re)) domains.push(name);
  for (const name of Object.keys(DOM_EXTRA)) {
    if (hits(DOM_EXTRA[name]) && !domains.includes(name)) domains.push(name);
  }
  for (const [name, re] of DOM_TIER2) {
    if (hits(re) && !domains.includes(name)) domains.push(name);
  }

  // subjects are what the person works ON; functions are what they DO about it
  const subjects = domains.filter(d => !FUNCTION_DOMAINS.has(d));
  const functions = domains.filter(d => FUNCTION_DOMAINS.has(d));

  const facets = FACETS.filter(([, re]) => hits(re)).map(f => f[0]);

  // A rank floor only when the question actually asks for seniority.
  //
  // SENIORITY and SEN_ORDER are NOT the same order — SENIORITY runs
  // ... Senior IC, Student, IC (match priority) while SEN_ORDER runs
  // ... Senior IC, IC, Student (actual rank). Store the resolved name and look
  // it up, or "directors in insurance" quietly admits individual contributors.
  let minRank = null;
  for (let i = 0; i < SENIORITY.length && i <= 3; i++) {
    // Only Founder..Senior IC are floors; student and IC tiers are not.
    if (hits(SENIORITY[i][1])) { minRank = SEN_ORDER.indexOf(SENIORITY[i][0]); break; }
  }

  // leftover words carry the specifics the taxonomy has no bucket for
  const terms = [...new Set(norm.split(' ').filter(w => w.length > 2 && !STOP.has(w)))];

  return { question, domains, subjects, functions, facets, minRank, terms };
}

/** The query, in words. Shown to the user — this is the trust mechanism. */
export function describe(f) {
  const parts = [];
  if (f.subjects.length) parts.push(`works on ${f.subjects.join(' or ')}`);
  if (f.functions.length) parts.push(`in ${f.functions.join(' or ')}`);
  if (f.facets.length) parts.push(f.facets.join(' or '));
  if (f.minRank != null) parts.push(`${SEN_ORDER[f.minRank]} or above`);
  if (f.terms.length) parts.push(`mentions ${f.terms.slice(0, 6).join(', ')}`);
  return parts.length ? parts.join(' · ') : 'no usable signal in the question';
}

const FACET_RE = Object.fromEntries(FACETS.map(([n, re]) => [n, re]));

/**
 * Score every person against the filter. Domain is the strongest signal because
 * it survived classification; loose term matches are worth least because a word
 * can land anywhere in a headline.
 */
/**
 * Inverse document frequency over the corpus. "satellite" appears in a handful
 * of headlines and "sales" in hundreds, so a satellite match should be worth far
 * more. Without this, common words drown the distinctive ones — which is exactly
 * how a satellite-imagery question returned four generic sales directors.
 */
export function buildIdf(people) {
  const df = new Map();
  for (const p of people) {
    const seen = new Set(`${p.role} ${p.company} ${p.headline}`.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
    for (const w of seen) df.set(w, (df.get(w) || 0) + 1);
  }
  const N = people.length;
  return term => Math.log(N / (1 + (df.get(term) || 0)));
}

/**
 * Score every person against the filter. Subject domain is the hardest gate:
 * if the question names a subject and the person is not in it, they are out.
 * Function and facet are AND-ed on top. Free terms are weighted by rarity.
 */
export function runQuery(filter, people, opts = {}) {
  const { subjects, functions, facets, minRank, terms } = filter;
  const idf = opts.idf || buildIdf(people);
  const out = [];

  for (const p of people) {
    const hay = `${p.role} ${p.company} ${p.headline}`;
    const low = hay.toLowerCase();
    let score = 0;
    const why = [];

    // --- subject gate ---
    if (subjects.length) {
      if (subjects.includes(p.domain)) { score += 5; why.push(p.domain); }
      else if (p.domains?.some(d => subjects.includes(d))) {
        score += 3.5; why.push(`${p.domains.find(d => subjects.includes(d))} (secondary)`);
      } else continue;
    }

    // --- function: satisfied by the classified domain OR by a facet regex ---
    if (functions.length || facets.length) {
      let ok = false;
      for (const fd of functions) {
        if (p.domain === fd || p.domains?.includes(fd)) { score += 3; why.push(fd); ok = true; }
      }
      for (const f of facets) {
        if (FACET_RE[f].test(hay)) { score += 3; why.push(f); ok = true; }
      }
      if (!ok) continue;
    }

    // --- rank ---
    const rank = SEN_ORDER.indexOf(p.seniority);
    if (minRank != null) {
      if (rank < 0 || rank > minRank) continue;
      score += (minRank - rank) + 2;
    } else if (rank >= 0 && rank <= 1) score += 1.5;

    // --- distinctive terms, weighted by rarity ---
    let termScore = 0, termHits = [];
    for (const t of terms) {
      if (low.includes(t)) { termScore += idf(t); termHits.push(t); }
    }
    score += termScore;
    if (termHits.length) why.push(termHits.slice(0, 3).join(' + '));

    if (p.company) score += 0.75;
    if (p.connectedOn && opts.now) {
      const years = (opts.now - p.connectedOn) / 3.156e10;
      score += Math.max(0, 1.5 - years * 0.25);
    }

    if (score > 0) out.push({ ...p, score, why });
  }

  out.sort((a, b) => b.score - a.score);
  return out;
}

/** One call: question -> ranked shortlist + the query that produced it. */
export function ask(question, people, opts = {}) {
  const filter = resolveQuery(question);
  const matches = runQuery(filter, people, opts);
  return {
    filter,
    query: describe(filter),
    total: matches.length,
    shortlist: matches.slice(0, opts.limit || 10)
  };
}
