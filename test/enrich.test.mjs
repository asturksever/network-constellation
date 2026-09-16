// Location and organisation type are the only two facts in this project that
// are inferred rather than read, so the rules about how they may be used are
// worth pinning: location excludes, orgType only rewards, and neither may
// quietly widen into something the question did not ask for.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveQuery, runQuery, describe, mergeFilter, matchesLocation, locationHint } from '../src/ask.js';
import { normKey, estimate, employerList } from '../src/enrich.js';

const person = o => ({
  name: o.name, role: o.role ?? '', company: o.company ?? '', headline: o.headline ?? '',
  seniority: o.seniority ?? 'Unstated', domain: o.domain ?? 'Other', domains: o.domains ?? [], i: o.i ?? 0
});

const employer = (name, o) => [normKey(name), {
  key: normKey(name), name,
  hqCity: o.city ?? null, hqCountry: o.country ?? null, hqCountryCode: o.code ?? null,
  region: o.region ?? null, industry: null, orgType: o.orgType ?? 'unknown', confidence: 'high'
}];

test('a place named in the question is noticed even with no key', () => {
  assert.deepEqual(locationHint('any venture capital based in Berlin?').cities, ['Berlin']);
  assert.equal(locationHint('who works on climate'), null);
});

test('a named city does not fall through to its country', () => {
  const e = { hqCity: 'Oakland', hqCountry: 'United States', hqCountryCode: 'US', region: 'North America' };
  // Asking for San Francisco must not match everyone in the US.
  assert.equal(matchesLocation(e, { cities: ['San Francisco'] }), false);
  // Unless the question also named the wider area.
  assert.equal(matchesLocation(e, { cities: ['San Francisco'], countryCodes: ['US'] }), true);
  assert.equal(matchesLocation({ ...e, hqCity: 'San Francisco' }, { cities: ['san francisco'] }), true);
});

test('location excludes people whose employer could not be placed, and says how many', () => {
  const people = [
    person({ i: 0, name: 'Placed', company: 'Harbour Line', domain: 'Insurance, Risk & Finance', headline: 'partner, venture capital' }),
    person({ i: 1, name: 'Elsewhere', company: 'Northwind', domain: 'Insurance, Risk & Finance', headline: 'partner, venture capital' }),
    person({ i: 2, name: 'Unknown employer', company: 'Someplace', domain: 'Insurance, Risk & Finance', headline: 'partner, venture capital' }),
    person({ i: 3, name: 'No employer', company: '', domain: 'Insurance, Risk & Finance', headline: 'angel investor' })
  ];
  const enrich = new Map([
    employer('Harbour Line', { city: 'San Francisco', code: 'US', orgType: 'venture capital firm' }),
    employer('Northwind', { city: 'Oslo', code: 'NO', orgType: 'company' })
  ]);

  const base = resolveQuery('any venture capital based in SF?');
  const filter = mergeFilter(base, {
    location: { cities: ['San Francisco'], countries: [], countryCodes: [], regions: [] },
    orgTypes: ['venture capital firm']
  });

  const out = runQuery(filter, people, { enrich });
  assert.deepEqual(out.map(p => p.name), ['Placed']);
  assert.equal(out.excludedForLocation, 3, 'the other three must be counted, not silently dropped');
  assert.ok(out[0].why.some(w => w.startsWith('employer HQ')));
  assert.ok(out[0].why.some(w => w.includes('venture capital firm')));
});

test('organisation type rewards but never gates', () => {
  const people = [
    person({ i: 0, name: 'At a VC', company: 'Harbour Line', domain: 'Insurance, Risk & Finance', headline: 'partner' }),
    person({ i: 1, name: 'Angel, no employer', company: '', domain: 'Insurance, Risk & Finance', headline: 'angel investor writing first cheques' })
  ];
  const enrich = new Map([employer('Harbour Line', { city: 'London', orgType: 'venture capital firm' })]);
  const filter = mergeFilter(resolveQuery('who invests'), { orgTypes: ['venture capital firm'] });

  const names = runQuery(filter, people, { enrich }).map(p => p.name);
  assert.ok(names.includes('Angel, no employer'), 'someone with no employer must still reach the answer');
  assert.ok(names.includes('At a VC'));
});

test('mergeFilter only accepts domains and facets the taxonomy knows', () => {
  const base = resolveQuery('who works on mapping');
  const merged = mergeFilter(base, {
    domains: ['AI & Machine Learning', 'Underwater Basket Weaving'],
    facets: ['invests', 'not a real facet'],
    synonyms: ['cartography', 'a']
  });
  assert.ok(merged.domains.includes('AI & Machine Learning'));
  assert.ok(!merged.domains.includes('Underwater Basket Weaving'));
  assert.deepEqual(merged.added.facets, ['invests']);
  assert.deepEqual(merged.added.terms, ['cartography'], 'two-letter noise is dropped');
});

test('describe reports the added constraints and where they came from', () => {
  const merged = mergeFilter(resolveQuery('any venture capital based in SF?'), {
    location: { cities: ['San Francisco'], countries: [], countryCodes: [], regions: [] },
    orgTypes: ['venture capital firm'],
    domains: ['AI & Machine Learning']
  });
  const text = describe(merged);
  assert.match(text, /employer is a venture capital firm/);
  assert.match(text, /employer HQ in San Francisco \(via Claude\)/);
  assert.match(text, /Claude added: AI & Machine Learning/);
  // The place must not also be scored as a free term.
  assert.ok(!/mentions[^\n]*francisco/i.test(text));
});

test('employer names normalise to one key', () => {
  assert.equal(normKey('  Harbour   Line Ventures. '), 'harbour line ventures');
  assert.equal(normKey('HARBOUR LINE VENTURES'), 'harbour line ventures');
});

test('the cost estimate is derived from the batch size, not invented', () => {
  const e = estimate(2305);
  assert.equal(e.batches, 58);
  assert.ok(e.dollars > 0.3 && e.dollars < 1.5, `expected well under a dollar, got ${e.dollars}`);
});

test('hubs are offered before the long tail of one-person employers', () => {
  const D = { comps: ['Big Co'], people: [] };
  const people = [person({ company: 'Big Co' }), person({ company: 'Tiny Co' })];
  assert.deepEqual(employerList(D, people, { hubsOnly: true }).map(j => j.name), ['Big Co']);
  assert.deepEqual(employerList(D, people).map(j => j.name), ['Big Co', 'Tiny Co']);
});
