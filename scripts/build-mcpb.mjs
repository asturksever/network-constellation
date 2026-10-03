#!/usr/bin/env node
// Package the MCP server as a Claude Desktop extension (.mcpb): one file to
// double-click, a file picker for Connections.csv, no Node to install (Claude
// Desktop runs Node extensions on its own built-in runtime).
//
//   node scripts/build-mcpb.mjs      -> dist/network-constellation.mcpb
//
// Stages only what the server imports — mcp/ and the five pure modules from
// src/ — then validates and packs with the official MCPB CLI, fetched by npx
// for the build only; it never becomes a dependency of this repo.
// dist/ is gitignored, and nothing personal is inside: the export is chosen by
// the user at install time and read from their disk.

import { mkdirSync, rmSync, copyFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const PKG = JSON.parse(readFileSync('package.json', 'utf8'));
const STAGE = 'dist/mcpb';
const OUT = 'dist/network-constellation.mcpb';
const MODULES = ['src/csv.js', 'src/build.js', 'src/classify.js', 'src/taxonomy.js', 'src/ask.js'];
const REPO = 'https://github.com/asturksever/network-constellation';

rmSync(STAGE, { recursive: true, force: true });
for (const dir of ['server/mcp', 'server/src']) mkdirSync(join(STAGE, dir), { recursive: true });
for (const f of ['mcp/server.mjs', 'mcp/network.mjs', ...MODULES]) copyFileSync(f, join(STAGE, 'server', f));
copyFileSync('mcp/icon.png', join(STAGE, 'icon.png'));
copyFileSync('LICENSE', join(STAGE, 'LICENSE'));
// server.mjs reads its version from ../package.json; "type": "module" makes src/*.js ESM
writeFileSync(join(STAGE, 'server/package.json'),
  JSON.stringify({ name: PKG.name, version: PKG.version, type: 'module', license: PKG.license }, null, 2) + '\n');

const tools = [
  ['network_overview', 'How many people, every field with its size, the seniority mix and the biggest employers'],
  ['network_ask', 'Answer a plain-English question about who you know, e.g. "who can intro me to a VC?"'],
  ['network_find_person', 'Look someone up by name, with who else you know at their employer'],
  ['network_list_people', 'People by field, employer, seniority or a word in their title'],
  ['network_list_employers', 'Employers ranked by how many of your connections work there'],
  ['network_get_employer', 'Everyone you know at one employer, most senior first']
];

const manifest = {
  manifest_version: '0.3',
  name: 'network-constellation',
  display_name: 'Network Constellation',
  version: PKG.version,
  description: 'Ask Claude about your LinkedIn network: who you know, where they work, and who can make an introduction. Reads your Connections.csv on this computer.',
  long_description: [
    'Point it at the **Connections.csv** LinkedIn gives you (Settings → Data privacy → Get a copy of your data → Connections) and ask Claude things like *"who in my network works in satellite imagery?"*, *"who do I know at Esri?"* or *"which three VCs do I know best?"*.',
    'People are grouped by what they do, using the same open-source classifier as the [Network Constellation](https://asturksever.github.io/network-constellation/) web app. Six read-only tools; nothing is changed and the extension never connects to the internet.',
    '**What Claude sees.** The file stays on your computer, but the answers to your questions (the names, job titles and employers of the people who match) become part of your conversation with Claude. Email addresses are never returned, and LinkedIn profile links only if you switch them on below.'
  ].join('\n\n'),
  author: { name: 'Said Turksever', url: 'https://github.com/asturksever' },
  repository: { type: 'git', url: `${REPO}.git` },
  homepage: 'https://asturksever.github.io/network-constellation/',
  documentation: `${REPO}/blob/main/docs/mcp.md`,
  support: `${REPO}/issues`,
  icon: 'icon.png',
  server: {
    type: 'node',
    entry_point: 'server/mcp/server.mjs',
    mcp_config: {
      command: 'node',
      args: ['${__dirname}/server/mcp/server.mjs', '--csv', '${user_config.connections_csv}'],
      env: { NC_INCLUDE_LINKS: '${user_config.include_links}' }
    }
  },
  tools: tools.map(([name, description]) => ({ name, description })),
  keywords: ['linkedin', 'network', 'connections', 'contacts', 'introductions', 'networking'],
  license: PKG.license,
  compatibility: { platforms: ['darwin', 'win32', 'linux'], runtimes: { node: '>=18.0.0' } },
  user_config: {
    connections_csv: {
      type: 'file',
      title: 'LinkedIn Connections.csv',
      description: 'Choose Connections.csv, the file inside LinkedIn’s data export once unzipped (not this extension file). It is read on this computer only.',
      required: true
    },
    include_links: {
      type: 'boolean',
      title: 'Include LinkedIn profile links',
      description: 'Also give Claude each person’s profile link. Off by default.',
      default: false,
      required: false
    }
  }
};
writeFileSync(join(STAGE, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// The official tool checks the manifest against the spec and builds the zip.
const mcpb = args => execFileSync('npx', ['-y', '@anthropic-ai/mcpb', ...args], { stdio: 'inherit' });
mcpb(['validate', join(STAGE, 'manifest.json')]);
if (existsSync(OUT)) rmSync(OUT);
mcpb(['pack', STAGE, OUT]);
console.log(`\n${OUT} — double-click to install in Claude Desktop.`);
