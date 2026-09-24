// The bring-your-own-key panel: paste a key, choose a scope, watch it run.
//
// Cost, scope and exactly what leaves the browser are all on screen before the
// button, because this is the one part of the tool that spends the user's money
// and sends anything anywhere.

import { $, fmt } from './dom.js';
import { prefs, KEY_STORAGE, allEmployers } from './store.js';
import { employerList, estimate, enrichEmployers, enrichOne, normKey } from './enrich.js';
import { LlmError, MODEL_EMPLOYERS } from './llm.js';

export async function wireEnrich({ D, people, onEmployers, say }) {
  const keyEl = $('apiKey');
  const rememberEl = $('rememberKey');
  const runEl = $('enrichRun');
  const progressEl = $('enrichProgress');
  const barEl = $('enrichBarFill');
  const statEl = $('enrichStat');
  const cancelEl = $('enrichCancel');
  const countEl = $('scopeCount');
  const costEl = $('scopeCost');
  const knownEl = $('enrichKnown');

  let scope = 'hubs';
  let controller = null;
  let employers = await allEmployers();

  /* ---- the settings sheet ---- */
  const sheet = $('settings');
  const openBtn = $('openSettings');
  const openSheet = () => {
    sheet.hidden = false;
    document.body.classList.add('sheet-up');
    setTimeout(() => (keyEl.value ? $('enrichRun') : keyEl)?.focus(), 60);
  };
  const closeSheet = () => {
    sheet.hidden = true;
    document.body.classList.remove('sheet-up');
    openBtn?.focus();
  };
  openBtn?.addEventListener('click', openSheet);
  $('settingsClose')?.addEventListener('click', closeSheet);
  $('settingsScrim')?.addEventListener('click', closeSheet);
  addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });
  // any "add a key" link anywhere on the page opens the same sheet
  document.addEventListener('click', e => { if (e.target.closest('.open-settings')) openSheet(); });
  const markKey = () => openBtn?.classList.toggle('has-key', Boolean(keyEl.value.trim()));
  keyEl.addEventListener('input', markKey);

  // A key kept from last time, if the user asked for that.
  const saved = prefs.get(KEY_STORAGE);
  if (saved) { keyEl.value = saved; rememberEl.checked = true; }
  markKey();


  onEmployers?.(employers);

  const jobsFor = s => employerList(D, people, { hubsOnly: s === 'hubs' });
  const pending = s => jobsFor(s).filter(j => !employers.has(j.key));

  function refresh() {
    const todo = pending(scope);
    const total = jobsFor(scope).length;
    const est = estimate(todo.length);
    countEl.textContent = todo.length
      ? `${fmt(todo.length)} to do of ${fmt(total)}`
      : `all ${fmt(total)} done`;
    costEl.textContent = todo.length
      ? `~$${est.dollars.toFixed(2)} · ~${est.seconds < 90 ? est.seconds + 's' : Math.round(est.seconds / 60) + ' min'}`
      : '';
    runEl.disabled = todo.length === 0;
    runEl.textContent = todo.length ? `Enrich ${fmt(todo.length)} employers` : 'Nothing to enrich';
    knownEl.textContent = employers.size
      ? `${fmt(employers.size)} employers already labelled, kept in this browser.`
      : '';
  }

  for (const b of document.querySelectorAll('#scopeSeg button')) {
    b.addEventListener('click', () => {
      scope = b.dataset.scope;
      for (const o of document.querySelectorAll('#scopeSeg button')) {
        o.setAttribute('aria-pressed', String(o === b));
      }
      refresh();
    });
  }

  keyEl.addEventListener('change', () => {
    if (rememberEl.checked) prefs.set(KEY_STORAGE, keyEl.value.trim());
  });
  rememberEl.addEventListener('change', () => {
    if (rememberEl.checked) prefs.set(KEY_STORAGE, keyEl.value.trim());
    else prefs.remove(KEY_STORAGE);
  });

  cancelEl.addEventListener('click', () => controller?.abort());

  runEl.addEventListener('click', async () => {
    const apiKey = keyEl.value.trim();
    if (!apiKey) { keyEl.focus(); say?.('Paste an API key first'); return; }

    const jobs = pending(scope);
    if (!jobs.length) return;

    controller = new AbortController();
    runEl.disabled = true;
    progressEl.hidden = false;
    barEl.style.width = '0%';
    statEl.textContent = `0 / ${fmt(jobs.length)}`;

    const onProgress = ({ done, total, dollars }) => {
      barEl.style.width = `${Math.round((done / total) * 100)}%`;
      statEl.textContent = `${fmt(done)} / ${fmt(total)} · $${dollars.toFixed(2)}`;
    };

    try {
      const out = await enrichEmployers({
        apiKey,
        model: MODEL_EMPLOYERS,
        jobs,
        signal: controller.signal,
        onProgress,
        onRecords: records => {
          for (const r of records) employers.set(r.key, r);
          onEmployers?.(employers);
        }
      });

      const note = (out.failures.length ? ` · ${out.failures.length} batches failed` : '') +
        (out.unsaved ? ` · ${fmt(out.unsaved)} not saved, this session only` : '');
      say?.(out.cancelled
        ? `Stopped — ${fmt(out.done)} done, kept${note}`
        : `Enriched ${fmt(out.done)} employers · $${out.dollars.toFixed(2)}${note}`);
      statEl.textContent = `${fmt(out.done)} / ${fmt(jobs.length)} · $${out.dollars.toFixed(2)}`;
    } catch (err) {
      const msg = err instanceof LlmError ? err.message : 'Enrichment failed.';
      statEl.textContent = msg;
      say?.(msg);
      console.error(err);
    } finally {
      controller = null;
      progressEl.hidden = false;
      refresh();
    }
  });

  refresh();

  /** Label one employer from the detail panel; same store, same cache. */
  async function enrichEmployer(name) {
    const apiKey = keyEl.value.trim();
    if (!apiKey) throw new Error('Paste an API key first.');
    const record = await enrichOne({ apiKey, model: MODEL_EMPLOYERS, name });
    if (record) {
      employers.set(record.key, record);
      onEmployers?.(employers);
      refresh();
    }
    return record;
  }

  return {
    get employers() { return employers; },
    get key() { return keyEl.value.trim(); },
    hasKey: () => Boolean(keyEl.value.trim()),
    openSettings: openSheet,
    enrichOne: enrichEmployer,
    normKey
  };
}
