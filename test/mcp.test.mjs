import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { loadNetwork, overview, ask, findPerson, listPeople, listEmployers, getEmployer, NetworkError } from '../mcp/network.mjs';

const SAMPLE = 'sample/sample-connections.csv';
const net = loadNetwork(SAMPLE);

test('the server answers from the export alone, and never hands out an email', () => {
  const o = overview(net);
  assert.equal(o.people, 250);
  assert.ok(o.fields.some(f => f.field === 'Earth Observation & RS'));
  const everything = JSON.stringify([ask(net, { question: 'who can intro me to a VC?', limit: 100 }), listPeople(net, { limit: 100 })]);
  assert.ok(!/@/.test(everything), 'no email address in any answer');
  assert.ok(!/linkedin\.com\/in\//.test(everything), 'no profile links unless asked for');
});

test('profile links appear only when switched on', () => {
  const withLinks = loadNetwork(SAMPLE, { includeLinks: true });
  assert.match(findPerson(withLinks, { name: 'Pavel Mendes' }).people[0].profile_url, /^https:\/\/www\.linkedin\.com\/in\//);
});

test('a question is answered as the web page answers it, with the reading shown', () => {
  const a = ask(net, { question: 'anyone in satellite imagery?', limit: 5 });
  assert.equal(a.total, 17);
  assert.match(a.interpreted_as, /Earth Observation/);
  assert.equal(a.people.length, 5);
  assert.equal(a.has_more, true);
  assert.equal(a.next_offset, 5);
  // a place is noticed but not pretended
  assert.ok(ask(net, { question: 'any VC based in London?' }).caveats.some(c => /no location/.test(c)));
});

test('filters and employers, and errors that say how to fix them', () => {
  const p = listPeople(net, { field: 'health', min_seniority: 'Manager & Lead' });
  assert.ok(p.people.every(x => x.field === 'Health & Life Sciences'));
  const e = getEmployer(net, { name: 'meridian' });
  assert.equal(e.employer, 'Meridian Fund');
  assert.ok(listEmployers(net, { field: 'insurance' }).employers.length > 0);
  assert.throws(() => listPeople(net, { field: 'nonsense' }), err => err instanceof NetworkError && /Fields in this network/.test(err.message));
  assert.throws(() => loadNetwork(undefined), /--csv/);
  assert.throws(() => loadNetwork('no/such/file.csv'), /No file at/);
});

test('speaks MCP over stdio: initialize, tools/list, tools/call', async () => {
  const child = spawn(process.execPath, ['mcp/server.mjs', '--csv', SAMPLE], { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = [];
  let buf = '';
  child.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  const send = m => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
  send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } });
  send({ method: 'notifications/initialized' });
  send({ id: 2, method: 'tools/list' });
  send({ id: 3, method: 'tools/call', params: { name: 'network_ask', arguments: { question: 'recruiters I know' } } });
  send({ id: 4, method: 'tools/call', params: { name: 'network_list_people', arguments: { field: 'nonsense' } } });
  send({ id: 5, method: 'no/such/method' });
  for (let t = 0; t < 100 && lines.length < 5; t++) await new Promise(r => setTimeout(r, 20));
  child.stdin.end();
  const by = id => lines.find(l => l.id === id);
  assert.equal(by(1).result.protocolVersion, '2025-06-18');
  assert.equal(by(1).result.serverInfo.name, 'network-constellation');
  assert.deepEqual(by(2).result.tools.map(t => t.name).sort(),
    ['network_ask', 'network_find_person', 'network_get_employer', 'network_list_employers', 'network_list_people', 'network_overview']);
  assert.ok(by(2).result.tools.every(t => t.annotations.readOnlyHint === true && t.inputSchema.type === 'object'));
  assert.equal(by(3).result.structuredContent.total, 8);
  assert.match(by(3).result.content[0].text, /8 people/);
  assert.equal(by(4).result.isError, true, 'a bad argument is a tool error the model can read, not a protocol error');
  assert.equal(by(5).error.code, -32601);
});

test('the Claude Desktop extension packs every module the server imports', async () => {
  const { readFileSync } = await import('node:fs');
  const { dirname, join, normalize } = await import('node:path');
  const listed = new Set(JSON.parse(readFileSync('scripts/build-mcpb.mjs', 'utf8').match(/const MODULES = (\[[^\]]*\])/)[1].replace(/'/g, '"')));
  const needed = new Set();
  const walk = file => {
    for (const [, rel] of readFileSync(file, 'utf8').matchAll(/from '(\.[^']+)'/g)) {
      const dep = normalize(join(dirname(file), rel));
      if (dep.startsWith('src/') && !needed.has(dep)) { needed.add(dep); walk(dep); }
      else if (dep.startsWith('mcp/')) walk(dep);
    }
  };
  walk('mcp/server.mjs');
  assert.deepEqual([...needed].sort(), [...listed].sort(), 'MODULES in scripts/build-mcpb.mjs must match what the server imports');
});
