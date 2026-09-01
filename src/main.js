import { createConstellation, PALETTE } from './graph.js';
import { createLabels } from './labels.js';
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
  // small conveniences the UI layer reads without importing the palette
  world.PALETTE = PALETTE;
  world.series = PALETTE.series;
  world.personColor = PALETTE.person;
  world.compColor = PALETTE.compHub;

  wireUI(world, D);
  createLabels(document.getElementById('labels'), world, D);

  world.apply();
  world.graph.cameraPosition({ x: 0, y: 0, z: 2400 });

  document.getElementById('genDate').textContent = D.generatedAt || '';
};

boot();
