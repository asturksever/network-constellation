// The three behaviours in ask.js that are load-bearing and easy to undo by
// accident. Each one was a real bug, not a hypothetical.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveQuery, runQuery, describe, buildIdf } from '../src/ask.js';
import { SEN_ORDER } from '../src/taxonomy.js';

/** A person in the shape classify() produces, which is what runQuery reads. */
const person = (o) => ({
  name: o.name,
  role: o.role ?? '',
  company: o.company ?? '',
  headline: o.headline ?? '',
  seniority: o.seniority ?? 'Unstated',
  domain: o.domain ?? 'Other',
  domains: o.domains ?? [],
  tier: o.tier ?? 1
});

test('a seniority floor resolves through SEN_ORDER, not the match order', () => {
  // SENIORITY (match priority) and SEN_ORDER (rank) disagree at indices 4 and 5.
  // Taking the match index straight let "directors" admit everyone down to IC.
  const f = resolveQuery('directors in insurance');
  assert.equal(f.minRank, SEN_ORDER.indexOf('VP, Head & Director'));
  assert.match(describe(f), /VP, Head & Director or above/);
});

test('student and IC tiers are not a floor', () => {
  for (const q of ['students studying urban planning', 'engineers in mapping']) {
    assert.equal(resolveQuery(q).minRank, null, q);
  }
});

test('a rank floor actually excludes people below it', () => {
  const people = [
    person({ name: 'Director', role: 'Director of Risk', seniority: 'VP, Head & Director', domain: 'Insurance, Risk & Finance' }),
    person({ name: 'IC', role: 'Risk Analyst', seniority: 'Individual contributor', domain: 'Insurance, Risk & Finance' }),
    person({ name: 'Student', role: 'Insurance student', seniority: 'Student & Early career', domain: 'Insurance, Risk & Finance' })
  ];
  const f = resolveQuery('directors in insurance');
  const names = runQuery(f, people).map(p => p.name);
  assert.deepEqual(names, ['Director']);
});

test('subject and function domains are intersected, never unioned', () => {
  // A union here returns every salesperson in the network. This is the bug the
  // prototype shipped with: 374 matches instead of 24.
  const people = [
    person({
      name: 'Both', role: 'Sales Director', company: 'SkyfieldSat',
      headline: 'Selling satellite imagery licences',
      domain: 'Earth Observation & RS',
      domains: ['Earth Observation & RS', 'Sales, BD & Marketing']
    }),
    person({
      name: 'SubjectOnly', role: 'Remote Sensing Scientist',
      headline: 'Satellite imagery analysis',
      domain: 'Earth Observation & RS', domains: ['Earth Observation & RS']
    }),
    person({
      name: 'FunctionOnly', role: 'Sales Manager',
      headline: 'Enterprise software sales',
      domain: 'Sales, BD & Marketing', domains: ['Sales, BD & Marketing']
    })
  ];
  const f = resolveQuery('satellite imagery licensing sales');
  assert.ok(f.subjects.length > 0, 'expected a subject domain');
  assert.ok(f.functions.length > 0 || f.facets.length > 0, 'expected a function or facet');
  assert.deepEqual(runQuery(f, people).map(p => p.name), ['Both']);
});

test('free terms are weighted by rarity, so a rare word outranks a common one', () => {
  const people = [
    person({ name: 'Rare', role: 'Engineer', headline: 'engineer working on bathymetry' }),
    person({ name: 'Common', role: 'Engineer', headline: 'engineer working on software' }),
    person({ name: 'Also', role: 'Engineer', headline: 'engineer working on software' })
  ];
  const idf = buildIdf(people);
  assert.ok(idf('bathymetry') > idf('engineer'), 'rare term must outweigh the ubiquitous one');
});

test('a question with no signal returns nobody, not everybody', () => {
  const people = [
    person({ name: 'A', role: 'Engineer', company: 'Acme', headline: 'engineer at Acme' }),
    person({ name: 'B', role: 'Hydrographer', company: 'Beta', headline: 'bathymetry surveys at Beta' })
  ];
  for (const q of ['who do you know?', 'anyone?', 'asdfgh qwerty']) {
    assert.equal(runQuery(resolveQuery(q), people).length, 0, q);
  }
  // a word that does appear still finds its person
  assert.deepEqual(runQuery(resolveQuery('anyone doing bathymetry'), people).map(p => p.name), ['B']);
});
