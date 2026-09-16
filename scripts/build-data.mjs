#!/usr/bin/env node
// data/followers.csv  ->  data/graph-data.json
//
//   node scripts/build-data.mjs [input.csv] [output.json]
//
// The input needs a name and a headline; a profile-URL column is optional but
// makes nodes clickable. Column names are matched loosely, and two shapes are
// understood without any flags:
//
//   a headline export   Name / Full headline / Profile URL
//   LinkedIn's own      First Name, Last Name, URL, Company, Position
//
// The second is what you get from Settings -> Get a copy of your data, and it
// is the path most people should use: it is yours by right, it needs no session
// cookie, and it cannot break when LinkedIn changes an internal endpoint. It
// carries no headline, so one is composed as "Position at Company" — which is
// exactly the shape classify.js already reads.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseCSV, pickColumn } from '../src/csv.js';
import { classify } from '../src/classify.js';
import { SEN_ORDER } from '../src/taxonomy.js';

const IN = process.argv[2] || 'data/followers.csv';
const OUT = process.argv[3] || 'data/graph-data.json';
const MIN_COMPANY_SIZE = 2; // an employer needs this many people to become a hub

if (!existsSync(IN)) {
  console.error(`No input at ${IN}\n` +
    'Get one from LinkedIn: Settings -> Data privacy -> Get a copy of your data\n' +
    `-> Connections. Unzip it and move Connections.csv to ${IN}`);
  process.exit(1);
}

// LinkedIn's export opens with a few "Notes:" lines before the real header.
// Drop everything above the first line that looks like a header row.
function deNote(text) {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex(l => /(^|,)\s*"?(First Name|Name|Full headline|Headline)"?\s*(,|$)/i.test(l));
  return at > 0 ? lines.slice(at).join('\n') : text;
}

const rows = parseCSV(deNote(readFileSync(IN, 'utf8')));
if (!rows.length) { console.error('No rows in ' + IN); process.exit(1); }

const cName  = pickColumn(rows[0], ['Name', 'Full name']);
const cFirst = pickColumn(rows[0], ['First name']);
const cLast  = pickColumn(rows[0], ['Last name']);
const cHead  = pickColumn(rows[0], ['Full headline', 'Headline', 'Occupation']);
const cPos   = pickColumn(rows[0], ['Position', 'Title', 'Job title']);
const cComp  = pickColumn(rows[0], ['Company', 'Company name', 'Organisation', 'Organization']);
const cUrl   = pickColumn(rows[0], ['Profile URL', 'URL', 'Profile', 'Link']);

const nameOf = cName
  ? r => r[cName]
  : r => [r[cFirst], r[cLast]].filter(Boolean).join(' ');

// A real headline wins. Failing that, "Position at Company" reconstructs one
// close enough for the classifier — and the "at X" is what the employer rule
// reads, so the official export loses nothing that matters here.
const headOf = cHead
  ? r => r[cHead]
  : r => [r[cPos], cComp && r[cComp] ? 'at ' + r[cComp] : ''].filter(Boolean).join(' ');

if ((!cName && !cFirst) || (!cHead && !cPos)) {
  console.error(
    'Need a name and either a headline or a position column.\n' +
    `Found: ${Object.keys(rows[0]).join(', ')}`);
  process.exit(1);
}
if (!cHead) console.log('No headline column — composing one from Position and Company.');

const trim = (s, n) => {
  s = (s || '').trim();
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
};
const slugOf = u => (u || '').replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, '').replace(/\/+$/, '');
// U+FFFD arrives from upstream now and then and breaks strict consumers.
const scrub = s => (s || '').replace(/�/g, '');

const people = rows.map(r => ({
  name: scrub(nameOf(r)),
  slug: cUrl ? slugOf(r[cUrl]) : '',
  ...classify(scrub(headOf(r)))
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
