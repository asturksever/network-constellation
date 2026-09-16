import { createConstellation, PALETTE } from './graph.js';
import { createLabels } from './labels.js';
import { createHighlight } from './highlight.js';
import { createLogos } from './logos.js';
import { wireUI } from './ui.js';
import { createLanding } from './upload.js';
import { peopleFromTuples, hydratePeople } from './build.js';
import { loadGraph, forgetAll } from './store.js';
import { $ } from './dom.js';

const DATA_URL = 'data/graph-data.json';
const PEOPLE_URL = 'data/people.json';

/**
 * Where a graph can come from, in order of preference:
 *
 *   1. inlined in the page      — the bundled single-file build
 *   2. this browser's storage   — a file dropped here earlier
 *   3. data/graph-data.json     — local development, after `npm run data`
 *
 * Nothing found means a first visit, which is the landing state rather than an
 * error. `people` is the rich classified view; when only the compact tuples
 * exist it is reconstructed without headlines, which costs the question
 * answering a third of its evidence but keeps it working.
 */
async function findGraph() {
  const inline = document.getElementById('nc-data');
  if (inline) {
    const D = JSON.parse(inline.textContent);
    const peopleEl = document.getElementById('nc-people');
    const people = peopleEl
      ? hydratePeople(D, JSON.parse(peopleEl.textContent))
      : peopleFromTuples(D);
    return { D, people, source: 'bundle' };
  }

  const kept = await loadGraph();
  if (kept?.D) {
    return { D: kept.D, people: kept.people || peopleFromTuples(kept.D), source: 'browser', sourceName: kept.sourceName };
  }

  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const D = await res.json();
    let people = null;
    try {
      const pr = await fetch(PEOPLE_URL);
      if (pr.ok) people = await pr.json();
    } catch { /* the compact payload alone is enough to draw */ }
    return { D, people: people || peopleFromTuples(D), source: 'disk' };
  } catch {
    return null;
  }
}

const boot = async () => {
  const landing = createLanding();
  const found = await findGraph();

  if (!found) { landing.show(); return; }
  landing.hide();

  const { D, people } = found;

  const world = createConstellation($('scene'), D, { rootLabel: 'You' });
  world.PALETTE = PALETTE;

  const marker = createHighlight($('labels'), world, D);
  const ui = wireUI(world, D, marker);
  createLabels($('labels'), world, D);

  const logoSources = await loadLogos();
  const logos = createLogos($('labels'), world, D, logoSources);
  const logoToggle = $('logoToggle');
  if (logos.count) {
    logoToggle.addEventListener('change', e => logos.setEnabled(e.target.checked));
  } else {
    logoToggle.checked = false;
    logoToggle.disabled = true;
    logoToggle.closest('.chk').title = 'No logos for these employers';
  }

  wireDataControls(found, landing);

  world.apply();
  world.graph.cameraPosition({ x: 0, y: 0, z: 2400 });

  $('genDate').textContent = D.generatedAt || '';

  // Kept here for the Ask UI to reach without another pass over the data.
  window.__NC = { world, D, people, ui, marker };
};

/**
 * Replacing a file reloads rather than tearing the world down: wireUI attaches
 * document- and window-level listeners that would stack on a second call, and
 * three.js has a scene graph to dispose of. A reload costs one page load and
 * cannot leak.
 */
function wireDataControls(found, landing) {
  const hint = $('dataHint');
  if (found.source === 'bundle') {
    $('dataGrp').hidden = true;
    return;
  }
  if (hint && found.sourceName) hint.textContent = found.sourceName + ' · this browser only';

  $('replaceData').addEventListener('click', () => landing.pick());

  $('forgetData').addEventListener('click', async () => {
    const el = $('forgetData');
    if (el.dataset.armed !== '1') {
      el.dataset.armed = '1';
      el.textContent = 'Erase it?';
      setTimeout(() => { el.dataset.armed = ''; el.textContent = 'Forget'; }, 4000);
      return;
    }
    await forgetAll();
    location.reload();
  });
}

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
