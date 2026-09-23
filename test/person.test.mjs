// The per-person read is the one place a person's own text leaves the browser,
// so what it sends is pinned here: role, headline, employer — never a name.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { personPayload, personKey } from '../src/personllm.js';

const p = {
  i: 7, name: 'Marta Ellison', slug: 'marta-ellison-100', email: 'never@here',
  role: 'Director, Data Licensing', headline: 'Director of Data Licensing at Vantara Imaging',
  company: 'Vantara Imaging', seniority: 'VP, Head & Director', domain: 'Earth Observation & RS'
};

test('the payload carries no name, slug or email, by construction', () => {
  const sent = personPayload(p, { hqCity: 'Lisbon', hqCountry: 'Portugal', orgType: 'startup', industry: 'imaging' });
  const text = JSON.stringify(sent);
  assert.ok(!text.includes('Marta'), 'name must not be sent');
  assert.ok(!text.includes('marta-ellison'), 'slug must not be sent');
  assert.ok(!text.includes('@'), 'email must not be sent');
  assert.deepEqual(Object.keys(sent).sort(), ['company', 'employer', 'headline', 'role']);
  assert.equal(sent.employer.hqCity, 'Lisbon');
  assert.equal(personPayload(p, null).employer, null);
});

test('the cache key is a hash of the sent text, so identical headlines share a read', () => {
  const twin = { ...p, name: 'Someone Else', slug: 'x', i: 99 };
  assert.equal(personKey(p), personKey(twin));
  assert.notEqual(personKey(p), personKey({ ...p, headline: 'different' }));
  assert.match(personKey(p), /^p:[0-9a-f]{8}$/);
  assert.ok(!personKey(p).includes('Marta'));
});
