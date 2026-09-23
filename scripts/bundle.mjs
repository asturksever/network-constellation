#!/usr/bin/env node
// Flattens the site into one self-contained HTML file for publishing as a
// Claude Artifact: inline CSS, inline data, modules concatenated in order.
//
//   node scripts/bundle.mjs [out.html]
//
// The output has no <!doctype>/<html>/<head>/<body> because the Artifact tool
// supplies those. Open it locally and it still renders — browsers infer them.
//
// There is no bundler here on purpose. That buys one constraint: MODULE_ORDER
// below is the dependency order, and the stripper only understands plain
// `import { a, b } from './x.js'` and a leading `export`. No default exports,
// no `import * as`, no renaming. Keep it that way or add a real bundler.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { leanPeople } from '../src/build.js';

const OUT = process.argv[2] || 'dist/network-constellation.html';
const DATA = 'data/graph-data.json';

// Dependency order. taxonomy/csv/classify must precede ask.js: without them the
// bundled ask.js referenced an undefined DOMAINS, which went unnoticed only
// because nothing called ask() yet.
const MODULE_ORDER = [
  'src/palette.js',
  'src/taxonomy.js',
  'src/csv.js',
  'src/classify.js',
  'src/build.js',
  'src/dom.js',
  'src/store.js',
  'src/ask.js',
  'src/llm.js',
  'src/enrich.js',
  'src/askllm.js',
  'src/research.js',
  'src/graph.js',
  'src/labels.js',
  'src/highlight.js',
  'src/logos.js',
  'src/ui.js',
  'src/askui.js',
  'src/enrichui.js',
  'src/detail.js',
  'src/overview.js',
  'src/upload.js',
  'src/main.js'
];

const LOGO_DIR = 'logos';
const MIME = { png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', ico: 'image/x-icon' };

/**
 * Logos have to travel inside the file. A published Artifact's CSP blocks every
 * external image, so a src pointing at logos/ or at any CDN silently renders
 * nothing — data URIs are the only thing that survives.
 */
function inlineLogos() {
  const manifestPath = `${LOGO_DIR}/manifest.json`;
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const out = {};
  let bytes = 0;
  for (const [name, file] of Object.entries(manifest)) {
    const path = `${LOGO_DIR}/${file}`;
    if (!existsSync(path)) continue;
    const buf = readFileSync(path);
    const ext = file.split('.').pop().toLowerCase();
    out[name] = `data:${MIME[ext] || 'image/png'};base64,${buf.toString('base64')}`;
    bytes += buf.length;
  }
  const n = Object.keys(out).length;
  if (!n) return null;
  console.log(`  inlined ${n} logos (${(bytes / 1024).toFixed(0)} KB)`);
  return out;
}

const hasData = existsSync(DATA);
if (!hasData) {
  console.log('No data — building an upload-only bundle. `npm run data` bakes a graph in.');
}

const BAD = [
  [/export\s+default/, 'export default'],
  [/import\s+\*\s+as/, 'import * as'],
  [/\bas\s+\w+\s*[,}]/, 'renamed import']
];

function strip(file) {
  let src = readFileSync(file, 'utf8');
  for (const [re, what] of BAD) {
    if (re.test(src)) {
      console.error(`${file} uses ${what}, which the naive bundler cannot flatten.`);
      process.exit(1);
    }
  }
  src = src.replace(/^\s*import\s+[^;]*?;\s*$/gms, '');
  src = src.replace(/^(\s*)export\s+/gm, '$1');
  recordDeclarations(file, src);
  return `\n/* ===== ${file} ===== */\n${src.trim()}\n`;
}

// Every module lands in one shared scope, so two modules declaring the same
// top-level name is a SyntaxError in the bundle and perfectly fine in the browser
// — the failure only shows up in the built file. Catch it here instead.
const declaredIn = new Map();
function recordDeclarations(file, src) {
  const re = /^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[1];
    const prev = declaredIn.get(name);
    if (prev && prev !== file) {
      console.error(
        `Both ${prev} and ${file} declare a top-level \`${name}\`. ` +
        `The bundle flattens them into one scope, so this would not parse. Rename one.`
      );
      process.exit(1);
    }
    declaredIn.set(name, file);
  }
}

const html = readFileSync('index.html', 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/\s*<script[^>]*src="src\/main\.js"[^>]*><\/script>/, '')
  .replace(/\s*<script[^>]*src="https:\/\/cdn\.jsdelivr[^>]*><\/script>/, '')
  .trim();

const css = readFileSync('src/styles.css', 'utf8');
const code = MODULE_ORDER.map(strip).join('\n');

// Artifact deploys reject raw U+FFFD and are happier with escaped angle brackets.
const forJson = t => t
  .replace(/\uFFFD/g, '')
  .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

const data = hasData ? forJson(readFileSync(DATA, 'utf8')) : null;
// The rich classified people, so the bundled build can answer questions against
// full headlines rather than the third of the evidence the tuples carry.
const PEOPLE = DATA.replace(/[^/\\]+$/, 'people.json');
const peopleJson = hasData && existsSync(PEOPLE)
  ? forJson(JSON.stringify(leanPeople(JSON.parse(readFileSync(PEOPLE, 'utf8')))))
  : null;

// The demo CSV rides along, so a single file handed to someone can still show
// them what it does without any other file beside it.
const SAMPLE = 'sample/sample-connections.csv';
const sampleScript = existsSync(SAMPLE)
  ? `<script>window.__NC_SAMPLE=${JSON.stringify(readFileSync(SAMPLE, 'utf8')).replace(/</g, '\\u003c')};</` + `script>\n`
  : '';

const logos = inlineLogos();
const logoScript = logos
  ? `<script>window.__NC_LOGOS=${JSON.stringify(logos).replace(/</g, '\\u003c')};</` + `script>\n`
  : '';

// The Artifact wrapper supplies a charset, but a file opened straight off disk
// has none — and without it every em-dash and ellipsis in the UI turns to
// mojibake. Emit our own so the standalone build is correct anywhere.
const out = `<meta charset="utf-8">
<title>Network Constellation</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;500&display=swap">
<style>
${css}
</style>

${body}

<script src="https://cdn.jsdelivr.net/npm/3d-force-graph@1.80.0/dist/3d-force-graph.min.js"></script>
${sampleScript}${logoScript}${data ? `<script type="application/json" id="nc-data">${data}</` + `script>\n` : ''}${peopleJson ? `<script type="application/json" id="nc-people">${peopleJson}</` + `script>\n` : ''}
<script>
(function () {
"use strict";
${code}
})();
</script>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out);
console.log(`${OUT}  ${(Buffer.byteLength(out) / 1024 / 1024).toFixed(2)} MB`);
