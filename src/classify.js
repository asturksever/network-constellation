// Turns one LinkedIn headline into structured attributes.
// Runs unchanged in Node (the build step) and in the browser (drop-your-own-CSV
// mode), so keep it free of DOM and filesystem calls.

import {
  DOMAINS, DOM_EXTRA, DOM_TIER2, SENIORITY, SEN_EXTRA, COMPANY_STOPWORDS
} from './taxonomy.js';

const DOMAIN_ORDER = DOMAINS.map(d => d[0]);

/** Strip URLs and query-string debris that would confuse the matchers. */
export function cleanHeadline(s) {
  return (s || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\b[\w.-]+\.(com|org|net|io|ai|co|uk|de|tr)\b\S*/gi, ' ')
    .replace(/[?&=]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The first clause of a headline — what the person calls themselves. */
export function extractRole(headline) {
  if (!headline) return '';
  let r = headline.split(/\s*[|•·—–]\s*/)[0];
  r = r.split(/\s+\bat\s+/i)[0];
  r = r.split(/\s*@\s*/)[0];
  return r.replace(/^[\s\-–—]+/, '').replace(/[\s,\-–—]+$/, '').trim();
}

/**
 * The employer, by one uniform rule: the capitalised run after "at" or "@".
 * Deliberately NOT a lookup against a list of known brands — that would inflate
 * big companies and undercount everyone else.
 */
export function extractCompany(headline) {
  const m = headline.match(
    /(?:@\s*|\bat\s+)([A-Z][A-Za-z0-9&.'’-]*(?:\s+(?:[A-Z][A-Za-z0-9&.'’-]*|of|for|and|de|du|the))*)/
  );
  if (!m) return '';
  const o = m[1].replace(/\s*[|·,;:].*$/, '').replace(/[.\s]+$/, '').replace(/\s+/g, ' ').trim();
  if (o.length < 2 || o.length > 42 || COMPANY_STOPWORDS.test(o)) return '';
  return o;
}

export function extractSeniority(headline) {
  for (const [name, re] of SENIORITY) if (re.test(headline)) return name;
  if (SEN_EXTRA.test(headline)) return 'Founder & C-suite';
  return 'Unstated';
}

/**
 * All matching domains, most-specific first, plus which tier the primary
 * came from: 1 = geo & core-adjacent, 2 = other industry, 3 = unplaceable.
 */
export function extractDomains(headline) {
  const doms = [];
  for (const [name, re] of DOMAINS) if (re.test(headline)) doms.push(name);
  for (const name of Object.keys(DOM_EXTRA)) {
    if (DOM_EXTRA[name].test(headline) && !doms.includes(name)) doms.push(name);
  }
  doms.sort((a, b) => DOMAIN_ORDER.indexOf(a) - DOMAIN_ORDER.indexOf(b));

  if (doms.length) return { doms, primary: doms[0], tier: 1 };
  for (const [name, re] of DOM_TIER2) {
    if (re.test(headline)) return { doms: [], primary: name, tier: 2 };
  }
  return {
    doms: [],
    primary: (!headline || headline.length < 3) ? 'No headline' : 'Other',
    tier: 3
  };
}

/** One person in, one classified record out. */
export function classify(rawHeadline) {
  const headline = cleanHeadline(rawHeadline);
  const { doms, primary, tier } = extractDomains(headline);
  return {
    headline,
    role: extractRole(headline),
    company: extractCompany(headline),
    seniority: extractSeniority(headline),
    domain: primary,
    domains: doms,
    tier
  };
}
