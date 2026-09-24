import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc } from '../src/dom.js';

test('esc makes text safe inside a quoted attribute, not just between tags', () => {
  const header = `Company "legal" name <b> & 'co'`;
  assert.equal(esc(header), 'Company &quot;legal&quot; name &lt;b&gt; &amp; &#39;co&#39;');
  // the case that broke the column mapper: a header closing value="..."
  assert.ok(!esc('x" onmouseover="alert(1)').includes('"'));
});

test('esc prints nothing for a missing value rather than "undefined"', () => {
  assert.equal(esc(undefined), '');
  assert.equal(esc(null), '');
  assert.equal(esc(0), '0');
});
