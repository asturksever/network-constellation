// The landing state: drop a Connections.csv in, get a constellation out.
//
// Nothing here uploads anything. The file is read with FileReader, parsed and
// classified in this tab, and the result is kept in this browser. The word
// "upload" is avoided in the copy for that reason.

import { $, esc, fmt } from './dom.js';
import { parseCSV, decodeCsv } from './csv.js';
import { deNote, buildGraph, detectColumns, columnsUsable, BuildError } from './build.js';
import { saveGraph, requestPersistence, storeProblem } from './store.js';

/** Which column plays which role, in the order the mapper shows them. */
const ROLES = [
  ['name', 'Full name', false],
  ['first', 'First name', false],
  ['last', 'Last name', false],
  ['headline', 'Headline', false],
  ['position', 'Position', false],
  ['company', 'Company', false],
  ['url', 'Profile URL', false],
  ['connectedOn', 'Connected on', false]
];

/**
 * The landing page. It knows how to read a file and build a graph from it; it
 * does not know what else is on the page. main.js tells it two things:
 *
 *   setDemo(fn)   — the demo is ready; fn(question?) opens it. Without it the
 *                   demo buttons are hidden.
 *   setBack(text) — a graph is already running behind the page; show a way
 *                   back to it, and let Escape take it.
 *
 * `onBuilt(built)` is the fallback for a browser that will not store the
 * graph: it returns true if it could show the graph without a reload.
 */
export function createLanding({ onBuilt } = {}) {
  const el = $('landing');
  const drop = $('dropzone');
  const input = $('csvFile');
  const state = $('landingState');
  const back = $('landingBack');

  let rows = null;
  let columns = null;
  let sourceName = '';
  let encodingNote = '';
  let openDemo = null;
  let accepting = true;     // false in a single-file build that carries its own graph

  const isUp = () => !el.classList.contains('gone');
  const show = () => {
    el.classList.remove('gone');
    document.body.classList.add('landing-up');
  };
  const hide = () => {
    el.classList.add('gone');
    document.body.classList.remove('landing-up');
  };

  function setDemo(fn) {
    openDemo = fn;
    el.classList.toggle('no-demo', !fn);
  }

  function setBack(text) {
    back.hidden = !text;
    if (text) back.textContent = text;
    // with a user's own graph behind the page there is no demo to open from here
    el.classList.toggle('returning', Boolean(text) && !openDemo);
  }

  const say = (html, kind = '') => {
    state.className = 'landing-state' + (kind ? ' ' + kind : '');
    state.innerHTML = html;
  };

  /* ---- reading a file ---- */

  // What to do instead, for the files that are not a CSV but get dropped anyway.
  const NOT_CSV = {
    'linkedin-zip': ['That is LinkedIn’s whole download.', 'Unzip it and drop the Connections.csv from inside.'],
    xlsx: ['That is an Excel workbook.', 'Open it in Excel or Numbers and save it as CSV (in Excel, File → Save As → CSV UTF-8), then drop that.'],
    xls: ['That is an older Excel workbook.', 'Open it and save it as CSV (in Excel, File → Save As → CSV UTF-8), then drop that.'],
    zip: ['That is a zip archive.', 'Unzip it and drop the CSV from inside.']
  };

  async function take(file) {
    sourceName = file.name;
    say(`<span class="ls-mono">Reading ${esc(file.name)}…</span>`);
    let decoded;
    try {
      decoded = decodeCsv(new Uint8Array(await file.arrayBuffer()));
    } catch (err) {
      say(`<span class="ls-mono">Could not read that file.</span>`, 'bad');
      console.error(err);
      return;
    }
    if (decoded.kind) {
      const [what, next] = NOT_CSV[decoded.kind];
      say(`<span class="ls-mono">${esc(what)}</span><span class="ls-note">${esc(next)}</span>`, 'bad');
      return;
    }
    takeText(decoded.text, file.name, decoded.encoding);
  }

  function takeText(text, name, encoding = 'utf-8') {
    sourceName = name;
    encodingNote = encoding === 'windows-1252'
      ? 'This file is not UTF-8, so it was read as Windows-1252, which is what Excel saves. If accented names look wrong below, save it again as “CSV UTF-8”.'
      : '';
    try {
      rows = parseCSV(deNote(text));
    } catch (err) {
      say('<span class="ls-mono">That does not parse as CSV.</span>', 'bad');
      console.error(err);
      return;
    }
    if (!rows.length) {
      say('<span class="ls-mono">That file has no rows in it.</span>', 'bad');
      return;
    }
    columns = detectColumns(rows[0]);
    if (columnsUsable(columns)) summarise();
    else mapper('Could not tell which column is which. Set them here.');
  }

  /* ---- what we think the columns are ---- */

  /** The first person's name as it will be shown, so a bad decode is visible before building. */
  function firstName() {
    const r = rows[0];
    if (columns.name) return r[columns.name] || '';
    return [r[columns.first], r[columns.last]].filter(Boolean).join(' ');
  }

  function summarise() {
    const named = ROLES
      .filter(([k]) => columns[k])
      .map(([k, label]) => `<span class="col"><span class="col-k">${label}</span>${esc(columns[k])}</span>`)
      .join('');
    say(
      `<div class="ls-head"><span class="ls-mono">${fmt(rows.length)} ${rows.length === 1 ? 'row' : 'rows'} · ${esc(sourceName)}</span>` +
      `<button type="button" class="linky" id="remap">Change columns</button></div>` +
      `<div class="cols">${named}</div>` +
      (encodingNote ? `<span class="ls-note">${esc(encodingNote)} First row: <strong>${esc(firstName())}</strong></span>` : '') +
      (columns.headline
        ? ''
        : '<span class="ls-note">No headline column, so one is composed as “Position at Company”. That is what the official export gives you and it classifies fine.</span>') +
      `<button type="button" class="primary" id="buildBtn">Build the constellation</button>`
    );
    $('remap').addEventListener('click', () => mapper());
    $('buildBtn').addEventListener('click', build);
  }

  /* ---- manual column mapping ---- */

  function mapper(message) {
    const headers = Object.keys(rows[0]);
    const options = k =>
      ['<option value="">— none —</option>']
        .concat(headers.map(h =>
          `<option value="${esc(h)}"${columns[k] === h ? ' selected' : ''}>${esc(h)}</option>`))
        .join('');

    say(
      (message ? `<span class="ls-note">${esc(message)}</span>` : '') +
      `<div class="map">` +
      ROLES.map(([k, label]) =>
        `<label class="map-row"><span class="map-k">${label}</span>` +
        `<select data-role="${k}">${options(k)}</select></label>`).join('') +
      `</div>` +
      `<span class="ls-note" id="mapWarn"></span>` +
      `<button type="button" class="primary" id="buildBtn">Build the constellation</button>`
    );

    const selects = [...state.querySelectorAll('select[data-role]')];
    const sync = () => {
      for (const s of selects) columns[s.dataset.role] = s.value || null;
      const ok = columnsUsable(columns);
      $('buildBtn').disabled = !ok;
      $('mapWarn').textContent = ok
        ? ''
        : 'Needs a name (or first and last) and either a headline or a position.';
    };
    selects.forEach(s => s.addEventListener('change', sync));
    sync();
    $('buildBtn').addEventListener('click', build);
  }

  /* ---- build, keep, reload ---- */

  async function build() {
    const btn = $('buildBtn');
    // Classifying is quick (about 0.1 s for 10,000 people); keeping several
    // megabytes in IndexedDB and reloading is what takes a moment. Each phase
    // is named on the button, and the button gets a frame to repaint first.
    const phase = async text => {
      if (btn) btn.textContent = text;
      // a frame to paint in, or 50 ms if the tab is in the background and has none
      await new Promise(r => { requestAnimationFrame(() => setTimeout(r, 0)); setTimeout(r, 50); });
    };
    if (btn) btn.disabled = true;
    await phase(`Classifying ${fmt(rows.length)} people…`);

    let built;
    try {
      built = buildGraph(rows, { columns });
    } catch (err) {
      const detail = err instanceof BuildError && err.detail?.found
        ? ` Found: ${err.detail.found.join(', ')}` : '';
      say(`<span class="ls-mono">${esc(err.message)}${esc(detail)}</span>`, 'bad');
      console.error(err);
      return;
    }

    try {
      await phase('Keeping it in this browser…');
      await requestPersistence();
      await saveGraph({ D: built.D, people: built.people, sourceName });
      await phase('Opening…');
    } catch (err) {
      // The graph is built; this browser just will not keep it. Show it now
      // if nothing else is running, and say plainly that a reload loses it.
      console.error('Could not keep the graph in this browser.', err);
      if (await onBuilt?.(built, sourceName)) { hide(); return; }
      say(
        `<span class="ls-mono">Built, but this browser would not store it.</span>` +
        `<span class="ls-note">${esc(storeProblem.message || 'Browser storage is unavailable here.')} ` +
        `Close other tabs of this page and try again.</span>` +
        `<button type="button" class="primary" id="buildBtn">Try again</button>`, 'bad');
      $('buildBtn').addEventListener('click', build);
      return;
    }
    location.reload();
  }

  /* ---- wiring ---- */

  // Reset after every pick, or choosing the same file a second time (after
  // fixing a column, say) fires no change event at all.
  input.addEventListener('change', e => {
    const file = e.target.files[0];
    input.value = '';
    if (file) take(file);
  });

  drop.addEventListener('click', e => { if (!e.target.closest('button, a')) input.click(); });
  drop.addEventListener('keydown', e => {
    if (e.target !== drop) return;       // the button inside answers for itself
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });
  $('pickFile').addEventListener('click', e => { e.preventDefault(); input.click(); });

  // The whole page is a drop target, the landing's own zone just says so most
  // loudly. A file dropped on the running graph opens the landing with it,
  // rather than being swallowed or navigating the tab away to the raw CSV.
  let depth = 0;
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  addEventListener('dragenter', e => {
    if (!hasFiles(e)) return;
    depth++;
    drop.classList.add('over');
  });
  addEventListener('dragleave', e => {
    if (!hasFiles(e)) return;
    if (--depth <= 0) { depth = 0; drop.classList.remove('over'); }
  });
  addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    drop.classList.remove('over');
    const file = e.dataTransfer.files[0];
    if (!file || !accepting) return;
    if (!isUp()) show();
    $('lp-drop')?.scrollIntoView({ block: 'center' });
    take(file);
  });

  el.addEventListener('scroll', () => el.classList.toggle('scrolled', el.scrollTop > 8), { passive: true });

  // In-page links scroll the landing rather than touching the URL.
  el.addEventListener('click', e => {
    const a = e.target.closest('[data-goto]');
    if (!a) return;
    e.preventDefault();
    const target = $(a.dataset.goto);
    target?.scrollIntoView({ block: a.dataset.goto === 'lp-drop' ? 'center' : 'start' });
    if (a.dataset.goto === 'lp-drop') drop.focus({ preventScroll: true });
  });

  $('tryDemo').addEventListener('click', () => openDemo?.());
  for (const chip of el.querySelectorAll('[data-ask]')) {
    chip.addEventListener('click', () => openDemo?.(chip.dataset.ask));
  }

  back.addEventListener('click', hide);
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && isUp() && !back.hidden) hide();
  });

  setDemo(null);
  return { show, hide, isUp, setDemo, setBack, takeText, setAccept: v => { accepting = v; } };
}
