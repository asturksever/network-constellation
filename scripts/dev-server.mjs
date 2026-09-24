#!/usr/bin/env node
// A static server for local development, with one job the stock Python one
// cannot do: send `Cache-Control: no-store`. Without it browsers apply
// heuristic caching to the ES modules and you end up debugging code you
// changed ten minutes ago.
//
//   node scripts/dev-server.mjs [port]           default 8080
//   node scripts/dev-server.mjs [port] --bare    as GitHub Pages will serve it
//
// --bare answers 404 for everything that is gitignored and so never reaches
// the public site — data/, logos/, dist/ — which is the only way to see the
// landing page and the demo on a machine that has a real graph on disk. Run
// it on its own port: a different origin also means empty browser storage,
// which is what a first visitor has.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve('.');
const args = process.argv.slice(2);
const BARE = args.includes('--bare');
const PORT = Number(args.find(a => /^\d+$/.test(a)) || process.env.PORT || 8080);
const PRIVATE = /^\/(data|logos|dist)\//;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    if (BARE && PRIVATE.test(file.slice(ROOT.length))) throw Object.assign(new Error('bare'), { code: 'ENOENT' });
    const info = await stat(file);
    if (info.isDirectory()) { res.writeHead(301, { Location: path + '/' }); res.end(); return; }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-store'
    });
    res.end(body);
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' });
    res.end(err.code === 'ENOENT' ? 'File not found' : String(err));
  }
}).listen(PORT, () => {
  console.log(`http://localhost:${PORT}  (no-store, serving ${ROOT}${BARE ? ', bare: no data/ logos/ dist/' : ''})`);
});
