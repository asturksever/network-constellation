#!/usr/bin/env node
// data/followers.csv  ->  data/graph-data.json
//
//   node scripts/build-data.mjs [input.csv] [output.json]
//
// The input needs a name column and a headline column; a profile-URL column is
// optional but makes nodes clickable. Column names are matched loosely, so both
// a raw pull and the enriched export work.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseCSV, pickColumn } from '../src/csv.js';
import { classify } from '../src/classify.js';
import { SEN_ORDER } from '../src/taxonomy.js';

const IN = process.argv[2] || 'data/followers.csv';
const OUT = process.argv[3] || 'data/graph-data.json';
const MIN_COMPANY_SIZE = 2; // an employer needs this many people to become a hub

if (!existsSync(IN)) {
  console.error(`No input at ${IN}\n` +
    `Pull one first: see scripts/pull-followers.js, then move the CSV to ${IN}`);
  process.exit(1);
}

const rows = parseCSV(readFileSync(IN, 'utf8'));
if (!rows.length) { console.error('No rows in ' + IN); process.exit(1); }

const cName = pickColumn(rows[0], ['Name', 'Full name', 'First name']);
const cHead = pickColumn(rows[0], ['Full headline', 'Headline', 'Occupation', 'Title']);
const cUrl  = pickColumn(rows[0], ['Profile URL', 'URL', 'Profile', 'Link']);
if (!cName || !cHead) {
  console.error(`Need a name and a headline column. Found: ${Object.keys(rows[0]).join(', ')}`);
  process.exit(1);
}

const trim = (s, n) => {
  s = (s || '').trim();
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
};
const slugOf = u => (u || '').replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, '').replace(/\/+$/, '');
// U+FFFD arrives from upstream now and then and breaks strict consumers.
const scrub = s => (s || '').replace(/�/g, '');

const people = rows.map(r => ({
  name: scrub(r[cName]),
  slug: cUrl ? slugOf(r[cUrl]) : '',
  ...classify(scrub(r[cHead]))
})).filter(p => p.name);

const domCount = new Map();
for (const p of people) domCount.set(p.domain, (domCount.get(p.domain) || 0) + 1);
const doms = [...domCount.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
const domIx = new Map(doms.map((d, i) => [d, i]));

const compCount = new Map();
for (const p of people) if (p.company) compCount.set(p.company, (compCount.get(p.company) || 0) + 1);
const comps = [...compCount.entries()]
  .filter(e => e[1] >= MIN_COMPANY_SIZE)
  .sort((a, b) => b[1] - a[1])
  .map(e => e[0]);
const compIx = new Map(comps.map((c, i) => [c, i]));

const senIx = new Map(SEN_ORDER.map((s, i) => [s, i]));

const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
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

writeFileSync(OUT, JSON.stringify(out));
const pct = n => ((n / people.length) * 100).toFixed(1) + '%';
console.log(`${OUT}
  people          ${people.length.toLocaleString('en-GB')}
  domains         ${doms.length}
  employer hubs   ${comps.length} (>= ${MIN_COMPANY_SIZE} people)
  named employer  ${out.namedCompany.toLocaleString('en-GB')} (${pct(out.namedCompany)})
  no rank stated  ${out.senCounts[6].toLocaleString('en-GB')} (${pct(out.senCounts[6])})
  unplaceable     ${(domCount.get('Other') || 0).toLocaleString('en-GB')}`);
