// The landing state: drop a Connections.csv in, get a constellation out.
//
// Nothing here uploads anything. The file is read with FileReader, parsed and
// classified in this tab, and the result is kept in this browser. The word
// "upload" is avoided in the copy for that reason.

import { $, esc, fmt } from './dom.js';
import { parseCSV } from './csv.js';
import { deNote, buildGraph, detectColumns, columnsUsable, BuildError } from './build.js';
import { saveGraph, requestPersistence } from './store.js';

const SAMPLE_URL = 'sample/sample-connections.csv';

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

export function createLanding({ onBuilt } = {}) {
  const el = $('landing');
  const drop = $('dropzone');
  const input = $('csvFile');
  const state = $('landingState');

  let rows = null;
  let columns = null;
  let sourceName = '';

  const show = () => {
    el.classList.remove('gone');
    document.body.classList.add('landing-up');
  };
  const hide = () => {
    el.classList.add('gone');
    document.body.classList.remove('landing-up');
  };

  const say = (html, kind = '') => {
    state.className = 'landing-state' + (kind ? ' ' + kind : '');
    state.innerHTML = html;
  };

  /* ---- reading a file ---- */

  async function take(file) {
    sourceName = file.name;
    say(`<span class="ls-mono">Reading ${esc(file.name)}…</span>`);
    let text;
    try {
      text = await file.text();
    } catch (err) {
      say(`<span class="ls-mono">Could not read that file.</span>`, 'bad');
      console.error(err);
      return;
    }
    takeText(text, file.name);
  }

  function takeText(text, name) {
    sourceName = name;
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

  function summarise() {
    const named = ROLES
      .filter(([k]) => columns[k])
      .map(([k, label]) => `<span class="col"><span class="col-k">${label}</span>${esc(columns[k])}</span>`)
      .join('');
    say(
      `<div class="ls-head"><span class="ls-mono">${fmt(rows.length)} rows · ${esc(sourceName)}</span>` +
      `<button type="button" class="linky" id="remap">Change columns</button></div>` +
      `<div class="cols">${named}</div>` +
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
    if (btn) { btn.disabled = true; btn.textContent = 'Classifying…'; }
    // Let the button repaint before the synchronous classify run.
    await new Promise(r => setTimeout(r, 16));

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
      await requestPersistence();
      await saveGraph({ D: built.D, people: built.people, sourceName });
    } catch (err) {
      // Worth carrying on: the graph is built, it just will not survive a reload.
      console.error('Could not keep the graph in this browser.', err);
      if (onBuilt) { hide(); onBuilt(built); return; }
    }
    location.reload();
  }

  /* ---- wiring ---- */

  input.addEventListener('change', e => { if (e.target.files[0]) take(e.target.files[0]); });

  drop.addEventListener('click', e => { if (!e.target.closest('button, a')) input.click(); });
  $('pickFile').addEventListener('click', e => { e.preventDefault(); input.click(); });

  for (const type of ['dragenter', 'dragover']) {
    drop.addEventListener(type, e => { e.preventDefault(); drop.classList.add('over'); });
  }
  for (const type of ['dragleave', 'drop']) {
    drop.addEventListener(type, e => { e.preventDefault(); drop.classList.remove('over'); });
  }
  drop.addEventListener('drop', e => {
    const file = e.dataTransfer?.files?.[0];
    if (file) take(file);
  });
  // A file dropped anywhere else would otherwise navigate the page away.
  for (const type of ['dragover', 'drop']) {
    window.addEventListener(type, e => { if (!drop.contains(e.target)) e.preventDefault(); });
  }

  $('tryDemo').addEventListener('click', async e => {
    e.preventDefault();
    say('<span class="ls-mono">Loading the demo…</span>');
    try {
      // The single-file build carries the sample inline; there is no second
      // file beside it to fetch.
      if (window.__NC_SAMPLE) { takeText(window.__NC_SAMPLE, 'sample-connections.csv'); return; }
      const res = await fetch(SAMPLE_URL);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      takeText(await res.text(), 'sample-connections.csv');
    } catch (err) {
      say('<span class="ls-mono">Could not load the demo file.</span>', 'bad');
      console.error(err);
    }
  });

  return { show, hide, takeText, pick: () => { show(); input.click(); } };
}
