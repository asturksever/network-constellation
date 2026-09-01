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

const OUT = process.argv[2] || 'dist/network-constellation.html';
const DATA = 'data/graph-data.json';

const MODULE_ORDER = [
  'src/graph.js',
  'src/labels.js',
  'src/ui.js',
  'src/main.js'
];

if (!existsSync(DATA)) {
  console.error(`No ${DATA}. Run \`npm run data\` first.`);
  process.exit(1);
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
  return `\n/* ===== ${file} ===== */\n${src.trim()}\n`;
}

const html = readFileSync('index.html', 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/\s*<script[^>]*src="src\/main\.js"[^>]*><\/script>/, '')
  .replace(/\s*<script[^>]*src="https:\/\/cdn\.jsdelivr[^>]*><\/script>/, '')
  .trim();

const css = readFileSync('src/styles.css', 'utf8');
const code = MODULE_ORDER.map(strip).join('\n');

// Artifact deploys reject raw U+FFFD and are happier with escaped angle brackets.
const data = readFileSync(DATA, 'utf8')
  .replace(/\uFFFD/g, '')
  .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

const out = `<title>Network Constellation</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;500&display=swap">
<style>
${css}
</style>

${body}

<script src="https://cdn.jsdelivr.net/npm/3d-force-graph@1.80.0/dist/3d-force-graph.min.js"></script>
<script type="application/json" id="nc-data">${data}</script>
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
