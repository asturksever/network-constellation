// The web research is the one feature that sends a person's name, so what it
// sends and how it is keyed are pinned, along with the brief's structure.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { researchPayload, researchKey, parseBrief, RESEARCH_SYSTEM, RESEARCH_HEADINGS } from '../src/research.js';
import { personKey } from '../src/personllm.js';

const p = {
  i: 3, name: 'Marta Ellison', slug: 'marta-ellison-100', email: 'never@here',
  role: 'Director, Data Licensing', headline: 'Director of Data Licensing at Vantara Imaging',
  company: 'Vantara Imaging'
};

test('the research payload carries the name, and nothing that is not stated', () => {
  const sent = researchPayload(p, { hqCity: 'Lisbon', hqCountry: 'Portugal', orgType: 'startup', industry: 'imaging' });
  assert.equal(sent.name, 'Marta Ellison', 'research needs the name; it is sent on purpose');
  assert.deepEqual(Object.keys(sent).sort(), ['company', 'employer', 'headline', 'name']);
  const text = JSON.stringify(sent);
  assert.ok(!text.includes('marta-ellison'), 'the profile slug must not be sent');
  assert.ok(!text.includes('@'), 'no email');
});

test('the research key includes the name, so it differs from the headline read key', () => {
  const twin = { ...p, name: 'Someone Else' };
  assert.notEqual(researchKey(p), researchKey(twin));
  assert.equal(personKey(p), personKey(twin), 'the headline read is still shared by identical headlines');
  assert.match(researchKey(p), /^r:[0-9a-f]{8}$/);
});

test('the prompt asks for exactly the six headings the renderer splits on', () => {
  for (const h of RESEARCH_HEADINGS) assert.ok(RESEARCH_SYSTEM.includes(`**${h}**`), h);
  assert.match(RESEARCH_SYSTEM, /Confidence: high \| medium \| low/);
  assert.match(RESEARCH_SYSTEM, /namesake/, 'identity check is the first step');
  assert.match(RESEARCH_SYSTEM, /private life/, 'private-life exclusion is stated');
  assert.match(RESEARCH_SYSTEM, /Photo: <direct image URL>/, 'the photo line is asked for');
});

test('parseBrief splits a brief into sections and reads the confidence line', () => {
  const text = [
    'I could not fully confirm this is the same person.',
    '**Identity**', 'Probably the Marta Ellison at Vantara.', '',
    '**Organisation**', 'Vantara sells imagery.',
    '## Role', 'Runs licensing.',
    'Track record', 'Spoke at a conference.',
    '**Signals**', 'Posts about SAR.',
    '**Approach**', '1. Ask about SAR.',
    'Confidence: medium — the employer matched but no photo did.',
    'Photo: https://example.com/team/marta.jpg'
  ].join('\n');
  const { sections, confidence, photo } = parseBrief(text);
  assert.equal(photo, 'https://example.com/team/marta.jpg');
  assert.equal(parseBrief('**Identity**\nx\nPhoto: none').photo, '');
  assert.equal(parseBrief('Photo: http://insecure.example.com/a.jpg').photo, '', 'only https images');
  assert.equal(parseBrief('Photo: https://example.com/page.html').photo, '', 'only direct image urls');
  assert.equal(confidence, 'medium');
  assert.match(sections.preamble, /could not fully confirm/);
  assert.match(sections.Identity, /Probably/);
  assert.match(sections.Role, /licensing/);
  assert.match(sections['Track record'], /conference/);
  assert.match(sections.Approach, /SAR/);
  assert.match(sections.confidenceWhy, /employer matched/);
});
