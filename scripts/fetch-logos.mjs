#!/usr/bin/env node
// Fetches a logo for each employer hub.
//
//   node scripts/fetch-logos.mjs        (npm run logos)
//
// RUN THIS IN YOUR OWN TERMINAL. It needs open internet: the Claude sandboxes
// that built this project can't reach logo services at all.
//
// Only employers already promoted to hubs get a logo, which means the
// MIN_COMPANY_SIZE floor in build-data.mjs (2 people) applies here for free —
// a company one person named never gets one.
//
// Coverage is partial by nature: a headline gives a company NAME, and a logo
// needs a DOMAIN. Well-known names are mapped by hand below; everything else
// gets a slug-plus-.com guess. Misses are skipped silently and the graph falls
// back to a plain sphere, so a wrong guess costs nothing.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const DATA = 'data/graph-data.json';
const OUT_DIR = 'logos';
const CONCURRENCY = 6;
const MIN_BYTES = 220;        // anything smaller is a placeholder or an error page

// Not companies — extraction artefacts and generic words that slipped through.
const SKIP = new Set([
  'Universit', 'Stealth Startup', 'Stealth', 'Esri T', 'Self Employed',
  'Freelance', 'Home', 'Remote', 'Various', 'Independent'
]);

// Hand-mapped where the guess would miss. Worth the keystrokes: these are the
// biggest hubs, so they carry most of the visual weight.
const DOMAINS = {
  'Meta': 'meta.com', 'Meta Reality Labs': 'meta.com', 'Facebook': 'meta.com',
  'WhatsApp': 'whatsapp.com', 'Instagram': 'instagram.com',
  'Esri': 'esri.com', 'Esri Canada': 'esri.ca', 'Esri India': 'esri.in',
  'Google': 'google.com', 'Google Maps': 'google.com', 'Google DeepMind': 'deepmind.google',
  'Amazon': 'amazon.com', 'AWS': 'aws.amazon.com', 'Amazon Web Services': 'aws.amazon.com',
  'Apple': 'apple.com', 'Microsoft': 'microsoft.com', 'NVIDIA': 'nvidia.com',
  'Qualcomm': 'qualcomm.com', 'Huawei': 'huawei.com', 'TikTok': 'tiktok.com',
  'TomTom': 'tomtom.com', 'HERE': 'here.com', 'HERE Technologies': 'here.com',
  'Mapbox': 'mapbox.com', 'CARTO': 'carto.com', 'Trimble': 'trimble.com',
  'Humanitarian OpenStreetMap Team': 'hotosm.org', 'OpenStreetMap': 'openstreetmap.org',
  'Development Seed': 'developmentseed.org', 'Ecopia AI': 'ecopiatech.com',
  'Niantic Spatial': 'nianticspatial.com', 'Pointr': 'pointr.tech',
  'Mosaic': 'mosaic51.com', 'Vantor': 'vantor.com', 'MindEarth': 'mindearth.ch',
  'Kpler': 'kpler.com', 'Wayve': 'wayve.ai', 'Waymo': 'waymo.com',
  'Strava': 'strava.com', 'Uber': 'uber.com', 'Bolt': 'bolt.eu',
  'Grab': 'grab.com', 'Getir': 'getir.com', 'Lime': 'li.me',
  'Deloitte': 'deloitte.com', 'PwC': 'pwc.com', 'Arup': 'arup.com',
  'WSP': 'wsp.com', 'HDR': 'hdrinc.com', 'Wipro': 'wipro.com',
  'Timmons Group': 'timmons.com',
  'World Bank': 'worldbank.org', 'UNICEF': 'unicef.org',
  'Transport for London': 'tfl.gov.uk',
  'Istanbul Technical University': 'itu.edu.tr', 'ITU': 'itu.edu.tr',
  'Gebze Technical University': 'gtu.edu.tr', 'Hacettepe University': 'hacettepe.edu.tr',
  'UCL': 'ucl.ac.uk', 'MIT': 'mit.edu', 'TUM': 'tum.de', 'TU Delft': 'tudelft.nl',
  'Georgia Tech': 'gatech.edu', 'ASU': 'asu.edu', 'HKUST': 'hkust.edu.hk',
  'Politecnico': 'polimi.it',
  'University of Bristol': 'bristol.ac.uk', 'University of Cambridge': 'cam.ac.uk',
  'University of Liverpool': 'liverpool.ac.uk'
};

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function guessDomain(name) {
  if (DOMAINS[name]) return DOMAINS[name];
  const bare = name.toLowerCase()
    .replace(/\b(inc|ltd|llc|gmbh|corp|corporation|company|group|technologies|technology|labs?|solutions)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
  if (bare.length < 3 || bare.length > 28) return null;
  return bare + '.com';
}

// unavatar aggregates several providers and falls through them itself; the
// others are direct fallbacks for when it comes back empty.
const sources = domain => [
  `https://unavatar.io/${domain}?fallback=false`,
  `https://icons.duckduckgo.com/ip3/${domain}.ico`,
  `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
];

async function grab(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
      headers: { 'user-agent': 'Mozilla/5.0 network-constellation/0.1' }
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || '';
    if (!/image|octet-stream/i.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < MIN_BYTES) return null;
    const ext = /svg/i.test(type) ? 'svg' : /png/i.test(type) ? 'png'
              : /jpe?g/i.test(type) ? 'jpg' : /icon|ico/i.test(type) ? 'ico' : 'png';
    return { buf, ext };
  } catch { return null; }
}

async function main() {
  if (!existsSync(DATA)) {
    console.error(`No ${DATA}. Run \`npm run data\` first.`);
    process.exit(1);
  }
  const D = JSON.parse(readFileSync(DATA, 'utf8'));
  mkdirSync(OUT_DIR, { recursive: true });

  const jobs = D.comps
    .map((name, i) => ({ name, count: D.compCounts[i] }))
    .filter(j => !SKIP.has(j.name))
    .sort((a, b) => b.count - a.count);

  console.log(`${jobs.length} employer hubs to try (of ${D.comps.length})\n`);

  const manifest = {};
  let done = 0, hit = 0;

  async function worker() {
    while (jobs.length) {
      const job = jobs.shift();
      const domain = guessDomain(job.name);
      done++;
      if (!domain) continue;
      for (const url of sources(domain)) {
        const got = await grab(url);
        if (!got) continue;
        const file = `${slug(job.name)}.${got.ext}`;
        writeFileSync(`${OUT_DIR}/${file}`, got.buf);
        manifest[job.name] = file;
        hit++;
        console.log(`  ✓ ${String(job.count).padStart(3)}  ${job.name}  →  ${domain}`);
        break;
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  writeFileSync(`${OUT_DIR}/manifest.json`, JSON.stringify(manifest, null, 0));
  const covered = D.comps.filter(c => manifest[c]).length;
  const people = D.comps.reduce((a, c, i) => a + (manifest[c] ? D.compCounts[i] : 0), 0);
  console.log(`\n${OUT_DIR}/manifest.json`);
  console.log(`  logos found   ${hit} of ${done} tried`);
  console.log(`  hubs covered  ${covered} / ${D.comps.length}  (${Math.round(covered / D.comps.length * 100)}%)`);
  console.log(`  people behind them  ${people.toLocaleString('en-GB')}`);
  console.log(`\nReload the dev server to see them. Re-run \`npm run bundle\` to bake them into dist/.`);
}

main();
