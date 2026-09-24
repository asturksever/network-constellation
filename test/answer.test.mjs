import { test } from 'node:test';
import assert from 'node:assert/strict';
import { highlightTerms, headlineRest } from '../src/askui.js';
import { overviewNumbers } from '../src/overview.js';

test('a matched word is marked through to the end of its word, and the rest is escaped', () => {
  assert.equal(highlightTerms('Technical Recruiter <Talent>', ['recruit']),
    'Technical <mark>Recruiter</mark> &lt;Talent&gt;');
  // matching is from the start of a word only, and case-insensitive
  assert.equal(highlightTerms('Unrecruitable', ['recruit']), 'Unrecruitable');
  // a term's regex characters are literal, and words under three letters are not marked
  assert.equal(highlightTerms('C++ at acme', ['c++', 'at']), '<mark>C++</mark> at acme');
  assert.equal(highlightTerms('axb a.b', ['a.b']), 'axb <mark>a.b</mark>', 'a dot is a dot, not a wildcard');
  assert.equal(highlightTerms('', ['x']), '');
  assert.equal(highlightTerms('no terms', null), 'no terms');
});

test('the headline shows only what it adds beyond role and employer', () => {
  assert.equal(headlineRest({ role: 'Analyst', company: 'Acme', headline: 'Analyst at Acme' }), '',
    'a composed "Role at Company" headline adds nothing');
  assert.equal(headlineRest({ role: 'Analyst', company: 'Acme', headline: 'Analyst | SAR imagery, maritime' }),
    'SAR imagery, maritime');
  assert.equal(headlineRest({ role: 'Analyst', company: '', headline: 'Helping insurers price flood risk' }),
    'Helping insurers price flood risk', 'a tagline that does not start with the role is kept whole');
  assert.equal(headlineRest({ role: '', company: '', headline: '' }), '');
});

test('the overview counts what the graph knows and nothing it does not', () => {
  const D = {
    total: 200, namedCompany: 58,
    senCounts: [5, 0, 20, 40, 60, 3, 72],        // SEN_ORDER, Unstated last
    doms: ['Other', 'Insurance', 'No headline', 'Climate', 'GIS', 'Mapping'],
    domCounts: [50, 40, 30, 30, 20, 10]
  };
  const people = [{ connectedOn: Date.UTC(2019, 2, 3) }, { connectedOn: null }, { connectedOn: Date.UTC(2025, 10, 20) }];
  const o = overviewNumbers(D, people);
  assert.equal(o.total, 200);
  assert.equal(o.pct, 29);
  assert.deepEqual(o.topFields.map(f => [f.d, f.share]), [['Insurance', 20], ['Climate', 15], ['GIS', 10]],
    '"Other" and "No headline" are not fields');
  assert.ok(o.topBands.length === 3 && o.topBands.every(b => b.s !== 'Unstated'), 'unstated is not a band');
  assert.deepEqual(o.topBands.map(b => b.n), [60, 40, 20]);
  assert.equal(o.span, 'Mar 2019 – Nov 2025');
  assert.equal(overviewNumbers(D, [{ connectedOn: null }]).span, '', 'no dates, no span');
});
