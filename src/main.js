import { createConstellation, PALETTE } from './graph.js';
import { createLabels } from './labels.js';
import { createHighlight } from './highlight.js';
import { createLogos } from './logos.js';
import { wireUI } from './ui.js';
import { wireAsk } from './askui.js';
import { wireEnrich } from './enrichui.js';
import { createDetail } from './detail.js';
import { renderOverview } from './overview.js';
import { createLanding } from './upload.js';
import { parseCSV } from './csv.js';
import { deNote, buildGraph, peopleFromTuples, hydratePeople } from './build.js';
import { loadGraph, forgetAll, storeProblem } from './store.js';
import { $ } from './dom.js';

const DATA_URL = 'data/graph-data.json';
const PEOPLE_URL = 'data/people.json';
const SAMPLE_URL = 'sample/sample-connections.csv';

// data/ and logos/ are gitignored: they exist only on the machine that ran
// `npm run data` or `npm run logos`. Anywhere else — the public site above
// all — asking for them is a guaranteed 404 in every visitor's console.
const LOCAL = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

/**
 * Where a graph can come from, in order of preference:
 *
 *   1. inlined in the page      — the bundled single-file build
 *   2. this browser's storage   — a file dropped here earlier
 *   3. data/graph-data.json     — local development, after `npm run data`
 *                                 (only asked for on localhost; see LOCAL)
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

  if (!LOCAL) return null;
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

/**
 * The demo: 250 invented people, built in this tab from the sample CSV and
 * never stored, so trying it can never overwrite anyone's own graph. The
 * single-file build carries the sample inline.
 */
async function loadDemo() {
  try {
    let text = window.__NC_SAMPLE;
    if (text == null) {
      const res = await fetch(SAMPLE_URL);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      text = await res.text();
    }
    // The sample's profile links are made up, and a made-up slug can belong to
    // a real stranger. The demo has no links at all rather than risk that.
    const rows = parseCSV(deNote(text)).map(({ URL, ...rest }) => rest);
    return buildGraph(rows);
  } catch (err) {
    console.warn('The demo could not be loaded.', err);
    return null;
  }
}

/**
 * Two ways the scene can fail to exist at all: the graph library did not load
 * (blocked CDN, offline), or the browser will not give us a WebGL context (old
 * machine, GPU blocklist, hardware acceleration switched off). The WebGL
 * failure surfaces as an async rejection deep inside three.js, so it has to be
 * found before anything is constructed rather than caught after.
 */
function makeWorld(D, opts = {}) {
  if (typeof ForceGraph3D === 'undefined') throw new Error('The 3d-force-graph library did not load.');
  if (!hasWebGL()) throw new Error('This browser could not open a WebGL context.');
  const world = createConstellation($('scene'), D, { rootLabel: 'You', ...opts });
  world.PALETTE = PALETTE;
  return world;
}

let app = null;        // the running app, once one has started
let starting = null;   // ...and the promise of it, so two clicks start one

const boot = async () => {
  let backdrop = null;   // the demo world turning behind the landing, before anyone chooses
  let onResize = null;

  const landing = createLanding({
    // This browser would not store a dropped file. Show it anyway, once, as
    // long as nothing else has been started on this page.
    onBuilt: async (built, sourceName) => {
      if (starting) return false;
      backdrop?.dispose();
      backdrop = null;
      if (onResize) removeEventListener('resize', onResize);
      starting = start({ D: built.D, people: built.people, source: 'memory', sourceName }, landing);
      return Boolean(await starting);
    }
  });

  const found = await findGraph();
  if (found) {
    landing.hide();
    starting = start(found, landing);
    return;
  }

  // A first visit: the landing, with the demo already turning behind it.
  landing.show();
  const demo = await loadDemo();
  if (!demo || starting) return;          // the landing still works without it
  try {
    // 250 people lay out in a few milliseconds, so the demo is settled before
    // its first frame and can be framed on its real shape straight away.
    backdrop = makeWorld(demo.D, { warmupTicks: 160 });
  } catch (err) {
    fatal(err);
    return;
  }
  backdrop.apply();
  backdrop.graph.cameraPosition({ x: 0, y: 0, z: 2400 });
  setTimeout(() => { if (!starting) backdrop?.frameGraph(1400); }, 60);
  setTimeout(() => { if (!starting) backdrop?.orbit(true); }, 1500);
  onResize = () => backdrop?.graph.width(innerWidth).height(innerHeight);
  addEventListener('resize', onResize);

  // Opening the demo wires the app onto the world that is already turning:
  // no reload, no second layout, the camera stays where it is.
  landing.setDemo(async question => {
    landing.hide();
    if (!starting) {
      backdrop.orbit(false);
      removeEventListener('resize', onResize);
      starting = start({ ...demo, source: 'demo', sourceName: 'The demo' }, landing, backdrop);
    }
    const running = await starting;
    if (question && running) running.ask.ask(question);
  });
};

/** Everything after the world exists: panels, questions, keys, the overview. */
async function start(found, landing, existing) {
  const { D, people } = found;

  let world = existing;
  if (!world) {
    try {
      world = makeWorld(D);
    } catch (err) {
      fatal(err);
      return null;
    }
  }

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

  const ask = wireAsk({ world, D, people, ui });
  const enrichment = await wireEnrich({
    D, people, say: ui.say,
    onEmployers: m => ask.setEmployers(m)
  });
  ask.enrichment = enrichment;

  // The side panel. It learns about clicks and landings through ui's hooks
  // rather than by re-binding the graph's click handler.
  const detail = createDetail({
    world, D, people, ui,
    getEmployers: () => enrichment.employers,
    getKey: () => enrichment.key,
    enrichOne: name => enrichment.enrichOne(name)
  });
  ui.setHooks({
    node: n => detail.showNode(n),
    // A question's results and name-search keystrokes land automatically; the
    // panel opens only for a landing the user chose.
    landed: (n, ctx) => { if (n.t === 'p' && !ctx?.auto) detail.showNode(n); }
  });
  ask.detail = detail;

  renderOverview({ D, people, world });

  wireDataControls(found, landing, ui);

  if (!existing) {
    world.apply();
    world.graph.cameraPosition({ x: 0, y: 0, z: 2400 });
  }

  $('genDate').textContent = D.generatedAt || '';

  if (existing) {
    // this world settled before anyone was listening, so nothing else will say so
    ui.say(`${people.length} people · click anyone, or ask a question`);
  }
  if (found.source === 'memory') {
    setTimeout(() => ui.say('Showing it once: this browser would not store it'), 1200);
  } else if (storeProblem.message) {
    // A blocked database is silent otherwise: the graph still draws, but
    // nothing persists and every Claude read is paid for again.
    setTimeout(() => ui.say(storeProblem.message), 3000);
  }

  app = { world, D, people, ui, marker, detail, ask, source: found.source };
  window.__NC = app;
  return app;
}

/**
 * Replacing a file reloads rather than tearing the world down: wireUI attaches
 * document- and window-level listeners that would stack on a second call, and
 * three.js has a scene graph to dispose of. A reload costs one page load and
 * cannot leak. The landing is how you get there, with a way back.
 */
function wireDataControls(found, landing, ui) {
  const hint = $('dataHint');
  const replace = $('replaceData');
  const forget = $('forgetData');

  if (found.source === 'bundle') {
    $('dataGrp').hidden = true;
    landing.setAccept(false);
    return;
  }

  const demo = found.source === 'demo';
  if (!demo) landing.setDemo(null);
  // nobody should mistake 250 invented people for their own network
  if (demo) $('ctl').querySelector('.ctl-head h1')?.insertAdjacentHTML('beforeend', ' <span class="demo-tag">Demo</span>');
  landing.setBack(demo ? 'Back to the demo' : 'Back to your graph');

  // Only a graph kept in this browser can be forgotten from it. One read off
  // disk, the demo, or one the browser refused to keep has nothing to erase.
  const kept = found.source === 'browser';
  forget.hidden = !kept;
  replace.textContent = demo ? 'Use my connections' : 'Use another file';
  hint.textContent = {
    demo: 'The demo: 250 invented people, nothing kept',
    browser: (found.sourceName || 'Your file') + ' · kept in this browser only',
    disk: 'Read from data/graph-data.json',
    memory: 'Not kept: this browser would not store it'
  }[found.source] || '';

  replace.addEventListener('click', () => {
    landing.show();
    $('landing').scrollTop = 0;
  });

  forget.addEventListener('click', async () => {
    if (forget.dataset.armed !== '1') {
      forget.dataset.armed = '1';
      forget.textContent = 'Erase from this browser?';
      setTimeout(() => { if (!forget.disabled) { forget.dataset.armed = ''; forget.textContent = 'Forget'; } }, 4000);
      return;
    }
    forget.disabled = true;
    forget.textContent = 'Erasing…';
    try {
      await forgetAll();
      location.reload();
    } catch (err) {
      console.error(err);
      ui.say(err.message, 9000);
      forget.dataset.armed = '';
      forget.textContent = 'Forget';
      forget.disabled = false;
    }
  });
}

/** A throwaway context, purely to find out whether a real one is possible. */
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Nothing can be drawn. Say what happened and what to do about it, rather than
 * leaving a dead page behind a status line that still says "Loading".
 */
function fatal(err) {
  console.error(err);
  const webgl = /webgl|context/i.test(String(err?.message));
  const el = $('landing');
  const inner = el?.querySelector('.landing-main');
  if (inner) {
    inner.innerHTML =
      '<div class="landing-state bad">' +
      '<span class="ls-mono">' +
      (webgl
        ? 'This browser could not open a 3D canvas.'
        : 'The graph library could not be loaded.') +
      '</span><span class="ls-note">' +
      (webgl
        ? 'Network Constellation needs WebGL. Try switching hardware acceleration on in your browser settings, or open it in a different browser.'
        : 'It is fetched from a CDN, so an offline machine or a blocked domain will stop it. Check your connection and reload.') +
      '</span></div>';
  }
  el?.classList.remove('gone');
  document.body.classList.add('landing-up');
  const status = $('status');
  if (status) status.textContent = webgl ? 'No WebGL' : 'Library did not load';
}

/**
 * The bundle inlines logos as data URIs (an Artifact's CSP blocks every external
 * image, so nothing else would load there). In dev they come off disk.
 */
async function loadLogos() {
  if (window.__NC_LOGOS) return window.__NC_LOGOS;
  if (!LOCAL) return {};
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
