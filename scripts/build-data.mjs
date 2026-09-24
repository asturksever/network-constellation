#!/usr/bin/env node
// data/Connections.csv  ->  data/graph-data.json  (+ data/people.json)
//
//   node scripts/build-data.mjs [input.csv] [output.json]
//
// All the actual work lives in src/build.js, which has no filesystem and no DOM
// so the browser runs the identical code on a dropped export. This file only
// reads, writes and reports.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseCSV, decodeCsv } from '../src/csv.js';
import { deNote, buildGraph, detectColumns, columnsUsable, BuildError } from '../src/build.js';

// LinkedIn's export is Connections.csv; followers.csv is the name the headline
// export used to go by, and is still picked up if that is what is there.
const IN = process.argv[2] ||
  ['data/Connections.csv', 'data/connections.csv', 'data/followers.csv'].find(f => existsSync(f)) ||
  'data/Connections.csv';
const OUT = process.argv[3] || 'data/graph-data.json';
// The rich classified objects, headlines and all, beside the compact payload.
// data/ is gitignored as a whole directory, so this never ships anywhere.
const OUT_PEOPLE = OUT.replace(/[^/\\]+$/, 'people.json');

if (!existsSync(IN)) {
  console.error(`No input at ${IN}\n` +
    'Get one from LinkedIn: Settings -> Data privacy -> Get a copy of your data\n' +
    `-> Connections. Unzip it and move Connections.csv to ${IN}`);
  process.exit(1);
}

const decoded = decodeCsv(readFileSync(IN));
if (decoded.kind) {
  console.error(`${IN} is not a CSV (${decoded.kind}). Export or unzip Connections.csv and point at that.`);
  process.exit(1);
}
if (decoded.encoding !== 'utf-8') console.warn(`Read ${IN} as ${decoded.encoding}.`);
const rows = parseCSV(deNote(decoded.text));
if (!rows.length) { console.error('No rows in ' + IN); process.exit(1); }

const columns = detectColumns(rows[0]);
if (!columnsUsable(columns)) {
  console.error(
    'Need a name and either a headline or a position column.\n' +
    `Found: ${Object.keys(rows[0]).join(', ')}`);
  process.exit(1);
}
if (!columns.headline) {
  console.log('No headline column — composing one from Position and Company.');
}

let built;
try {
  built = buildGraph(rows, { columns });
} catch (e) {
  if (e instanceof BuildError) {
    console.error(e.message + (e.detail?.found ? `\nFound: ${e.detail.found.join(', ')}` : ''));
    process.exit(1);
  }
  throw e;
}

const { D, people, stats } = built;

writeFileSync(OUT, JSON.stringify(D));
writeFileSync(OUT_PEOPLE, JSON.stringify(people));

const n = v => v.toLocaleString('en-GB');
const pct = v => ((v / stats.people) * 100).toFixed(1) + '%';
console.log(`${OUT}
  people          ${n(stats.people)}
  domains         ${stats.domains}
  employer hubs   ${stats.employerHubs} (>= ${stats.minCompanySize} people)
  named employer  ${n(stats.namedCompany)} (${pct(stats.namedCompany)})
  no rank stated  ${n(stats.unstated)} (${pct(stats.unstated)})
  unplaceable     ${n(stats.unplaceable)}`);
