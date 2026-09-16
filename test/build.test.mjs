// src/build.js is the one path Node and the browser share, so it is the piece
// most worth pinning. The snapshot makes any change to the taxonomy or the
// aggregation visible in a diff instead of silent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseCSV } from '../src/csv.js';
import {
  deNote, buildGraph, detectColumns, columnsUsable, composeHeadline, BuildError
} from '../src/build.js';

const SAMPLE = 'sample/sample-connections.csv';
const FIXTURE = 'test/fixtures/sample-graph.json';
const raw = readFileSync(SAMPLE, 'utf8');
const rows = parseCSV(deNote(raw));

test('the "Notes:" preamble is stripped and the real header is used', () => {
  assert.match(raw.split('\n')[0], /^Notes:/);
  assert.deepEqual(
    Object.keys(rows[0]),
    ['First Name', 'Last Name', 'URL', 'Email Address', 'Company', 'Position', 'Connected On']
  );
});

test('columns resolve from the official export, and email never does', () => {
  const c = detectColumns(rows[0]);
  assert.ok(columnsUsable(c));
  assert.equal(c.first, 'First Name');
  assert.equal(c.last, 'Last Name');
  assert.equal(c.position, 'Position');
  assert.equal(c.company, 'Company');
  assert.equal(c.url, 'URL');
  assert.equal(c.headline, null, 'the official export has no headline column');
  assert.ok(
    !Object.values(c).some(v => v && /mail/i.test(v)),
    'no resolved column may be the email column'
  );
});

test('a headline is composed as "Position at Company"', () => {
  const c = detectColumns(rows[0]);
  const withCompany = rows.find(r => r.Company);
  assert.equal(
    composeHeadline(withCompany, c),
    `${withCompany.Position} at ${withCompany.Company}`
  );
  const without = rows.find(r => !r.Company);
  assert.equal(composeHeadline(without, c), without.Position);
});

test('buildGraph returns aligned compact and rich views of the same people', () => {
  const { D, people, stats } = buildGraph(rows, { generatedAt: '2026-01-01' });

  assert.equal(D.people.length, people.length);
  assert.equal(D.total, people.length);
  assert.ok(people.length > 200, 'the sample should carry a usable number of people');

  for (const t of D.people) assert.equal(t.length, 7, 'tuple arity is the graph contract');

  // The alignment that lets an ask result address a node as PPL0 + i.
  people.forEach((p, i) => {
    assert.equal(p.i, i);
    assert.equal(D.people[i][0], p.name.length <= 44 ? p.name : D.people[i][0]);
  });

  // Rich objects keep the evidence the tuples throw away.
  assert.ok(people.some(p => p.headline), 'headlines must survive into the rich view');
  assert.ok(people.some(p => p.connectedOn), 'Connected On should be parsed');

  // Nothing resembling an email may reach either view.
  assert.equal(Object.keys(people[0]).filter(k => /mail/i.test(k)).length, 0);
  assert.ok(!JSON.stringify(D).includes('@'), 'no address should reach the payload');

  // Parallel arrays stay parallel.
  assert.equal(D.doms.length, D.domCounts.length);
  assert.equal(D.doms.length, D.domTiers.length);
  assert.equal(D.comps.length, D.compCounts.length);
  assert.equal(D.sen.length, D.senCounts.length);
  assert.equal(D.senCounts.reduce((a, b) => a + b, 0), people.length);
  assert.equal(D.domCounts.reduce((a, b) => a + b, 0), people.length);

  // Employer hubs need two people; everyone else's employer rides in slot 6.
  assert.ok(D.compCounts.every(n => n >= stats.minCompanySize));
  assert.deepEqual([...D.compCounts].sort((a, b) => b - a), D.compCounts);
  assert.deepEqual([...D.domCounts].sort((a, b) => b - a), D.domCounts);
});

test('the sample graph matches its snapshot', () => {
  const { D } = buildGraph(rows, { generatedAt: '2026-01-01' });
  if (!existsSync(FIXTURE) || process.env.UPDATE_FIXTURES) {
    writeFileSync(FIXTURE, JSON.stringify(D, null, 2) + '\n');
    console.log(`wrote ${FIXTURE}`);
    return;
  }
  assert.deepEqual(
    D,
    JSON.parse(readFileSync(FIXTURE, 'utf8')),
    'Reclassification is often the point — if this is the change you meant, ' +
    'rerun with UPDATE_FIXTURES=1 and commit the diff.'
  );
});

test('an unusable file is refused with a message a person can act on', () => {
  assert.throws(() => buildGraph([]), BuildError);
  assert.throws(
    () => buildGraph([{ Nickname: 'x', Vibe: 'y' }]),
    e => e instanceof BuildError && /name/i.test(e.message) && e.detail.found.includes('Nickname')
  );
});

test('renamed columns still resolve, so another export can be dropped in', () => {
  const c = detectColumns({ 'Full name': '', 'Job title': '', 'Organisation': '', 'Link': '' });
  assert.ok(columnsUsable(c));
  assert.equal(c.name, 'Full name');
  assert.equal(c.position, 'Job title');
  assert.equal(c.company, 'Organisation');
  assert.equal(c.url, 'Link');
});
