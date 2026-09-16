// CSV rows -> the graph payload, with no filesystem and no DOM.
//
// This is the half of the old build-data.mjs that is pure logic, lifted out so
// Node and the browser run the same code. The Node script is now a thin wrapper
// that reads a file and writes one; the browser calls buildGraph() directly on a
// dropped export and never writes anything anywhere.
//
// Two shapes are understood without a flag:
//
//   a headline export   Name / Full headline / Profile URL
//   LinkedIn's own      First Name, Last Name, URL, Company, Position
//
// The second is what Settings -> Get a copy of your data gives you, and it is
// the path to prefer: it is yours by right, needs no session cookie, and cannot
// break when LinkedIn changes an internal endpoint. It carries no headline, so
// one is composed as "Position at Company" — exactly the shape classify.js reads.

import { pickColumn } from './csv.js';
import { classify } from './classify.js';
import { SEN_ORDER } from './taxonomy.js';

/** An employer needs this many people before it earns a hub of its own. */
export const MIN_COMPANY_SIZE = 2;

/** Thrown for anything a user can fix by choosing different columns. */
export class BuildError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'BuildError';
    this.detail = detail;
  }
}

/**
 * LinkedIn's export opens with a few "Notes:" lines above the real header.
 * Drop everything above the first line that looks like a header row.
 */
export function deNote(text) {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex(l =>
    /(^|,)\s*"?(First Name|Name|Full headline|Headline)"?\s*(,|$)/i.test(l));
  return at > 0 ? lines.slice(at).join('\n') : text;
}

/**
 * Which column plays which role. Matching is loose and by name, so an export
 * from somewhere else works as long as it carries the same ideas.
 *
 * The email column is deliberately never resolved. LinkedIn's export carries
 * one and nothing in this project has any business reading it.
 */
export function detectColumns(row) {
  return {
    name: pickColumn(row, ['Name', 'Full name']),
    first: pickColumn(row, ['First name']),
    last: pickColumn(row, ['Last name']),
    headline: pickColumn(row, ['Full headline', 'Headline', 'Occupation']),
    position: pickColumn(row, ['Position', 'Title', 'Job title']),
    company: pickColumn(row, ['Company', 'Company name', 'Organisation', 'Organization']),
    url: pickColumn(row, ['Profile URL', 'URL', 'Profile', 'Link']),
    connectedOn: pickColumn(row, ['Connected On', 'Connected'])
  };
}

/** Enough to build with: a name, and something to classify. */
export function columnsUsable(c) {
  return Boolean((c.name || c.first) && (c.headline || c.position));
}

export function composeName(row, c) {
  return c.name ? row[c.name] : [row[c.first], row[c.last]].filter(Boolean).join(' ');
}

/**
 * A real headline wins. Failing that, "Position at Company" reconstructs one
 * close enough for the classifier — and the "at X" is what the employer rule
 * reads, so the official export loses nothing that matters here.
 */
export function composeHeadline(row, c) {
  if (c.headline) return row[c.headline];
  return [row[c.position], c.company && row[c.company] ? 'at ' + row[c.company] : '']
    .filter(Boolean)
    .join(' ');
}

const trim = (s, n) => {
  s = (s || '').trim();
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
};
const slugOf = u =>
  (u || '').replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, '').replace(/\/+$/, '');
// U+FFFD arrives from upstream now and then and breaks strict consumers.
const scrub = s => (s || '').replace(/�/g, '');

const parseDate = v => {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
};

/**
 * Rows in, graph out.
 *
 * Returns three things:
 *
 *   D       the compact payload the 3D scene reads, shape unchanged from the
 *           version this was lifted from — key order included, because the
 *           regression check diffs the serialised file.
 *   people  the same people as rich classify() objects, aligned index for index
 *           with D.people. That alignment is what lets an ask result address a
 *           node directly as world.PPL0 + i, and it is why ask.js can score
 *           against the full headline without any of it being serialised.
 *   stats   the numbers the CLI prints and the UI shows.
 */
export function buildGraph(rows, opts = {}) {
  if (!rows.length) throw new BuildError('That file has no rows in it.');

  const columns = opts.columns || detectColumns(rows[0]);
  if (!columnsUsable(columns)) {
    throw new BuildError(
      'Need a name column and either a headline or a position column.',
      { found: Object.keys(rows[0]) });
  }

  const minCompanySize = opts.minCompanySize ?? MIN_COMPANY_SIZE;

  const people = rows
    .map((r, row) => ({
      row,
      name: scrub(composeName(r, columns)),
      slug: columns.url ? slugOf(r[columns.url]) : '',
      connectedOn: columns.connectedOn ? parseDate(r[columns.connectedOn]) : null,
      ...classify(scrub(composeHeadline(r, columns)))
    }))
    .filter(p => p.name)
    .map((p, i) => ({ ...p, i }));

  if (!people.length) throw new BuildError('No rows in that file had a name.');

  const domCount = new Map();
  for (const p of people) domCount.set(p.domain, (domCount.get(p.domain) || 0) + 1);
  const doms = [...domCount.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
  const domIx = new Map(doms.map((d, i) => [d, i]));

  const compCount = new Map();
  for (const p of people) {
    if (p.company) compCount.set(p.company, (compCount.get(p.company) || 0) + 1);
  }
  const comps = [...compCount.entries()]
    .filter(e => e[1] >= minCompanySize)
    .sort((a, b) => b[1] - a[1])
    .map(e => e[0]);
  const compIx = new Map(comps.map((c, i) => [c, i]));

  const senIx = new Map(SEN_ORDER.map((s, i) => [s, i]));

  const D = {
    generatedAt: opts.generatedAt || new Date().toISOString().slice(0, 10),
    total: people.length,
    namedCompany: people.filter(p => p.company).length,
    sen: SEN_ORDER,
    senCounts: SEN_ORDER.map(s => people.filter(p => p.seniority === s).length),
    doms,
    domCounts: doms.map(d => domCount.get(d)),
    domTiers: doms.map(d => {
      const p = people.find(x => x.domain === d);
      return p ? p.tier : 3;
    }),
    comps,
    compCounts: comps.map(c => compCount.get(c)),
    // [name, role, companyHubIndex, domainIndex, seniorityIndex, slug, unhubbedCompany]
    people: people.map(p => [
      trim(p.name, 44),
      trim(p.role, 64),
      compIx.has(p.company) ? compIx.get(p.company) : -1,
      domIx.get(p.domain),
      senIx.get(p.seniority) ?? 6,
      p.slug,
      p.company && !compIx.has(p.company) ? trim(p.company, 40) : ''
    ])
  };

  const stats = {
    people: people.length,
    domains: doms.length,
    employerHubs: comps.length,
    namedCompany: D.namedCompany,
    unstated: D.senCounts[6],
    unplaceable: domCount.get('Other') || 0,
    minCompanySize
  };

  return { D, people, stats, columns };
}

/**
 * The compact tuples back into something ask.js can score, for the one case
 * where the rich objects are not available: an old bundle that only ships D.
 * The headline is empty, so the scorer works on a third of its usual evidence —
 * which is exactly why the browser build classifies in the page instead.
 */
export function peopleFromTuples(D) {
  return D.people.map((p, i) => ({
    i,
    name: p[0],
    role: p[1],
    company: p[2] >= 0 ? D.comps[p[2]] : (p[6] || ''),
    headline: '',
    seniority: D.sen[p[4]] || 'Unstated',
    domain: D.doms[p[3]],
    domains: [],
    slug: p[5],
    connectedOn: null,
    degraded: true
  }));
}

/**
 * The bundled single-file build already carries name, role, company, slug,
 * seniority and domain inside D's tuples. The only things the rich view adds
 * are the headline, the full list of matched domains, and the connection date —
 * so ship those three and rebuild the rest, rather than serialising every
 * person twice. On the real 10k set that is the difference between about
 * 900 KB and 3.7 MB.
 */
export function leanPeople(people) {
  return people.map(p => [p.headline || '', p.domains || [], p.connectedOn || 0]);
}

export function hydratePeople(D, lean) {
  const base = peopleFromTuples(D);
  return base.map((p, i) => {
    const l = lean[i];
    if (!l) return p;
    return {
      ...p,
      headline: l[0] || '',
      domains: l[1] || [],
      connectedOn: l[2] || null,
      degraded: false
    };
  });
}
