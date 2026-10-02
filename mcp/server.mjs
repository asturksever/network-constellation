#!/usr/bin/env node
// Network Constellation as an MCP server: ask your AI tool about your LinkedIn
// network.
//
//   node mcp/server.mjs --csv ~/Downloads/Connections.csv [--include-links]
//
// stdio transport, newline-delimited JSON-RPC 2.0, tools only. It is written
// against the protocol directly rather than the SDK for the same reason the
// rest of the repo has no dependencies: there is nothing to install, so
// `npx github:asturksever/network-constellation` just runs.
//
// stdout is the protocol channel. Anything for a human goes to stderr.

import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadNetwork, overview, ask, findPerson, listPeople, listEmployers, getEmployer, NetworkError } from './network.mjs';

const PKG = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'));
const SUPPORTED = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

/* ---------------- configuration ---------------- */

const argv = process.argv.slice(2);
const flag = name => argv.includes(name);
const value = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
if (flag('--help') || flag('-h')) {
  process.stderr.write(`Network Constellation MCP server ${PKG.version}

  network-constellation-mcp --csv /path/to/Connections.csv [--include-links]

  --csv PATH         your LinkedIn Connections.csv (or set NC_CSV)
  --include-links    also return LinkedIn profile links (off by default)

Configure it in your MCP client; see docs/mcp.md.
`);
  process.exit(0);
}
const CSV = value('--csv') || process.env.NC_CSV;
const LINKS = flag('--include-links') || ['1', 'true'].includes(String(process.env.NC_INCLUDE_LINKS).toLowerCase());
const log = (...a) => process.stderr.write('[network-constellation] ' + a.join(' ') + '\n');

// Read lazily, once: a bad path becomes a tool error the AI can explain,
// rather than a server that dies before the client can show anything.
let net = null;
function network() {
  if (!net) {
    const t0 = Date.now();
    net = loadNetwork(CSV, { includeLinks: LINKS });
    log(`read ${net.people.length} people from ${net.path} in ${Date.now() - t0} ms`);
  }
  return net;
}

/* ---------------- tools ---------------- */

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const FORMAT = { type: 'string', enum: ['markdown', 'json'], default: 'markdown', description: 'markdown for reading, json for further processing' };
const LIMIT = (d, max) => ({ type: 'integer', minimum: 1, maximum: max, default: d, description: `How many to return (1–${max})` });
const OFFSET = { type: 'integer', minimum: 0, default: 0, description: 'Skip this many results, for the next page (use next_offset from the previous call)' };
const people = n => `${n.toLocaleString('en-GB')} ${n === 1 ? 'person' : 'people'}`;
const SENIORITY = 'Founder & C-suite, VP, Head & Director, Manager & Lead, Senior IC, Individual contributor, Student & Early career, Unstated';

const TOOLS = [
  {
    name: 'network_overview',
    title: 'Network overview',
    description: 'The shape of the user’s LinkedIn network: how many people, every field (cluster) with its size, the seniority mix, the biggest employers and the span of connection dates. Call this first to learn the field names the other tools accept.',
    inputSchema: { type: 'object', properties: { response_format: FORMAT } },
    run: (n) => overview(n),
    md: o => [
      `**${people(o.people)}**, ${o.with_employer.toLocaleString('en-GB')} with a stated employer, ${o.employer_hubs} employers shared by two or more.` +
        (o.connected_between ? ` Connected ${o.connected_between[0]} to ${o.connected_between[1]}.` : ''),
      '', '**Fields**', ...o.fields.map(f => `- ${f.field}: ${f.people}`),
      '', '**Seniority**', ...o.seniority.filter(s => s.people).map(s => `- ${s.level}: ${s.people}`),
      '', '**Biggest employers**', ...o.top_employers.map(e => `- ${e.employer}: ${e.people}`),
      '', ...o.notes.map(n => `_${n}_`)
    ].join('\n')
  },
  {
    name: 'network_ask',
    title: 'Ask the network',
    description: 'Answer a plain-English question about who the user knows, e.g. "who can intro me to a VC?", "anyone in satellite imagery licensing?", "senior people in insurance". The question becomes a filter on field, job function, seniority and distinctive words, shown in interpreted_as so the reading can be checked; results are ranked best first. Location is not available from the export.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question, in the words the user used' },
        limit: LIMIT(20, 100), offset: OFFSET, response_format: FORMAT
      },
      required: ['question']
    },
    run: (n, a) => ask(n, a),
    md: o => [
      `**${people(o.total)}** ${o.total === 1 ? 'matches' : 'match'} "${o.question}".`, `_Read as: ${o.interpreted_as.replace(/\n/g, ' · ')}_`,
      ...o.caveats.map(c => `> ${c}`), '',
      ...o.people.map(p => `${p.rank}. **${p.name}** — ${[p.role, p.company].filter(Boolean).join(', ') || 'no title'} · ${p.field} · ${p.seniority}` +
        (p.matched_on.length ? ` _(${p.matched_on.join(', ')})_` : '') + (p.profile_url ? ` ${p.profile_url}` : '')),
      o.has_more ? `\n_${o.total - o.offset - o.count} more — call again with offset ${o.next_offset}._` : ''
    ].join('\n')
  },
  {
    name: 'network_find_person',
    title: 'Find a person',
    description: 'Look someone up by name (or part of a name) and get their role, employer, field, seniority, headline, when they connected, and who else the user knows at the same employer.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'A name or part of one, e.g. "Freya" or "Vranken"' }, limit: LIMIT(10, 50), response_format: FORMAT },
      required: ['name']
    },
    run: (n, a) => findPerson(n, a),
    md: o => o.people.length
      ? [`**${o.total}** match "${o.query}"${o.total > o.people.length ? ` (showing ${o.people.length})` : ''}.`, '',
        ...o.people.map(p => [
          `**${p.name}** — ${[p.role, p.company].filter(Boolean).join(', ') || 'no title'}`,
          `  ${p.field} · ${p.seniority}${p.connected_on ? ` · connected ${p.connected_on}` : ''}${p.profile_url ? ` · ${p.profile_url}` : ''}`,
          p.headline && p.headline !== [p.role, p.company].filter(Boolean).join(' at ') ? `  _${p.headline}_` : null,
          p.colleagues_you_know ? `  Also at ${p.company}: ${p.colleagues.map(c => c.name).join(', ')}${p.colleagues_you_know > p.colleagues.length ? ` and ${p.colleagues_you_know - p.colleagues.length} more` : ''}` : null
        ].filter(Boolean).join('\n'))].join('\n')
      : `Nobody in this network has a name like "${o.query}".`
  },
  {
    name: 'network_list_people',
    title: 'List people',
    description: 'List people matching structured filters, any combination of: a field (from network_overview), an employer (part of its name), an exact seniority or a minimum one, and a word in their title or headline. Paginated.',
    inputSchema: {
      type: 'object',
      properties: {
        field: { type: 'string', description: 'A field name from network_overview, or a unique part of one, e.g. "insurance"' },
        employer: { type: 'string', description: 'Part of an employer name' },
        seniority: { type: 'string', description: `Exactly this level: ${SENIORITY}` },
        min_seniority: { type: 'string', description: 'This level or more senior, e.g. "Manager & Lead"' },
        contains: { type: 'string', description: 'A word that must appear in their title, employer or headline' },
        sort: { type: 'string', enum: ['recent', 'seniority', 'name'], default: 'recent', description: 'recent = most recently connected first' },
        limit: LIMIT(20, 100), offset: OFFSET, response_format: FORMAT
      }
    },
    run: (n, a) => listPeople(n, a),
    md: o => [
      `**${people(o.total)}**${Object.entries(o.filters).filter(([k, v]) => v && k !== 'sort').map(([k, v]) => ` · ${k.replace('_', ' ')}: ${v}`).join('')}`, '',
      ...o.people.map(p => `- **${p.name}** — ${[p.role, p.company].filter(Boolean).join(', ') || 'no title'} · ${p.field} · ${p.seniority}${p.profile_url ? ` ${p.profile_url}` : ''}`),
      o.has_more ? `\n_More — call again with offset ${o.next_offset}._` : ''
    ].join('\n')
  },
  {
    name: 'network_list_employers',
    title: 'List employers',
    description: 'Employers ranked by how many of the user’s connections work there, optionally within one field or matching part of a name. Use it to find where the user has the most people in a sector.',
    inputSchema: {
      type: 'object',
      properties: {
        field: { type: 'string', description: 'Only count people in this field (from network_overview)' },
        contains: { type: 'string', description: 'Part of the employer name' },
        min_people: { type: 'integer', minimum: 1, default: 2, description: 'Only employers with at least this many connections' },
        limit: LIMIT(25, 100), offset: OFFSET, response_format: FORMAT
      }
    },
    run: (n, a) => listEmployers(n, a),
    md: o => [
      `**${o.total} employers**${o.filters.field ? ` with people in ${o.filters.field}` : ''}.`, '',
      ...o.employers.map(e => `- **${e.employer}**: ${e.in_field != null ? `${e.in_field} in field, ` : ''}${e.people} in all · ${e.main_fields.join(', ')}`),
      o.has_more ? `\n_More — call again with offset ${o.next_offset}._` : ''
    ].join('\n')
  },
  {
    name: 'network_get_employer',
    title: 'People at an employer',
    description: 'Everyone the user knows at one employer, most senior first, with the seniority and field mix there.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'The employer name or a distinctive part of it' }, limit: LIMIT(50, 200), response_format: FORMAT },
      required: ['name']
    },
    run: (n, a) => getEmployer(n, a),
    md: o => [
      `**${o.employer}**: ${people(o.people)} you know.`,
      `Seniority: ${o.seniority.map(s => `${s.level} ${s.people}`).join(', ')}.`,
      `Fields: ${o.fields.map(f => `${f.field} ${f.people}`).join(', ')}.`, '',
      ...o.staff.map(p => `- **${p.name}** — ${p.role || 'no title'} · ${p.seniority}${p.profile_url ? ` ${p.profile_url}` : ''}`),
      o.has_more ? '\n_More people than shown — raise limit._' : ''
    ].join('\n')
  }
].map(t => ({ ...t, annotations: { title: t.title, ...READ_ONLY } }));

const INSTRUCTIONS =
  'Tools over the user’s own LinkedIn connections, read from their Connections.csv on this machine. ' +
  'Start with network_overview for the field names. Use network_ask for plain-English questions, network_find_person for a name, ' +
  'network_list_people for structured filters and network_get_employer for one organisation. ' +
  'Fields and seniority are inferred from job titles, and there is no location data. ' +
  'These are real people: share only what the user asks for.';

/* ---------------- JSON-RPC over stdio ---------------- */

const send = msg => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');
const reply = (id, result) => send({ id, result });
const fail = (id, code, message) => send({ id, error: { code, message } });

function callTool(params) {
  const tool = TOOLS.find(t => t.name === params?.name);
  if (!tool) return { error: [-32602, `Unknown tool: ${params?.name}`] };
  const args = params.arguments || {};
  try {
    const data = tool.run(network(), args);
    const text = args.response_format === 'json' ? JSON.stringify(data, null, 2) : tool.md(data);
    return { result: { content: [{ type: 'text', text }], structuredContent: data } };
  } catch (err) {
    // Tool errors go back as results, so the model can read them and recover.
    const message = err instanceof NetworkError ? err.message : `Something went wrong: ${err.message}`;
    if (!(err instanceof NetworkError)) log(err.stack || err);
    return { result: { content: [{ type: 'text', text: message }], isError: true } };
  }
}

function handle(msg) {
  const { id, method, params } = msg;
  const isRequest = id !== undefined && id !== null;
  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      return reply(id, {
        protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'network-constellation', title: 'Network Constellation', version: PKG.version },
        instructions: INSTRUCTIONS
      });
    }
    case 'ping': return reply(id, {});
    case 'tools/list':
      return reply(id, { tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })) });
    case 'tools/call': {
      const out = callTool(params);
      return out.error ? fail(id, ...out.error) : reply(id, out.result);
    }
    default:
      if (method?.startsWith('notifications/')) return;          // initialized, cancelled: nothing to do
      if (isRequest) return fail(id, -32601, `Method not found: ${method}`);
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', line => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return fail(null, -32700, 'Parse error'); }
  for (const m of Array.isArray(msg) ? msg : [msg]) {
    try { handle(m); } catch (err) { log(err.stack || err); if (m?.id != null) fail(m.id, -32603, 'Internal error'); }
  }
});
rl.on('close', () => process.exit(0));
log(`ready (${CSV ? 'export: ' + CSV : 'no --csv given yet'}${LINKS ? ', profile links on' : ''})`);
