import { createConstellation, PALETTE } from './graph.js';
import { createLabels } from './labels.js';
import { createLogos } from './logos.js';
import { wireUI } from './ui.js';

const DATA_URL = 'data/graph-data.json';

const boot = async () => {
  let D;
  try {
    // The bundled single-file build inlines the data; dev fetches it.
    const inline = document.getElementById('nc-data');
    D = inline ? JSON.parse(inline.textContent) : await (async () => {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })();
  } catch (err) {
    document.getElementById('status').textContent =
      'No data yet — run: npm run data';
    console.error(`Could not load ${DATA_URL}. Build it with \`npm run data\`.`, err);
    return;
  }

  const world = createConstellation(document.getElementById('scene'), D, { rootLabel: 'You' });
  world.PALETTE = PALETTE;

  const ui = wireUI(world, D);
  createLabels(document.getElementById('labels'), world, D);

  const logoSources = await loadLogos();
  const logos = createLogos(document.getElementById('labels'), world, D, logoSources);
  const logoToggle = document.getElementById('logoToggle');
  if (logos.count) {
    logoToggle.addEventListener('change', e => logos.setEnabled(e.target.checked));
  } else {
    logoToggle.checked = false;
    logoToggle.disabled = true;
    logoToggle.closest('.chk').title = 'No logos yet — run: npm run logos';
  }

  world.apply();
  world.graph.cameraPosition({ x: 0, y: 0, z: 2400 });

  document.getElementById('genDate').textContent = D.generatedAt || '';
};

/**
 * The bundle inlines logos as data URIs (an Artifact's CSP blocks every external
 * image, so nothing else would load there). In dev they come off disk.
 */
async function loadLogos() {
  if (window.__NC_LOGOS) return window.__NC_LOGOS;
  try {
    const res = await fetch('logos/manifest.json');
    if (!res.ok) return {};
    const manifest = await res.json();
    return Object.fromEntries(
      Object.entries(manifest).map(([name, file]) => [name, 'logos/' + file])
    );
  } catch {
    return {};   // no logos fetched yet — the graph just shows spheres
  }
}

boot();
