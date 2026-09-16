// The question box and its answer panel.
//
// The engine in ask.js has been finished and tested for a while; this is the
// part that was missing. Two rules shape it:
//
//   Show the query that ran. describe() exists for exactly this. The person
//   asking knows these people, so a shortlist whose reasoning is visible is
//   correctable and one whose reasoning is hidden is worthless.
//
//   Clicking a result goes through ui.land(), the same path the name search
//   uses. One camera, one marker, one status line.

import { $, esc, fmt } from './dom.js';
import { resolveQuery, runQuery, describe, buildIdf } from './ask.js';

const LIMIT = 12;

export function wireAsk({ world, D, people, ui }) {
  const box = $('ask');
  const panel = $('answer');
  const queryEl = $('askQuery');
  const listEl = $('askList');
  const countEl = $('askCount');
  const emptyEl = $('askEmpty');

  // One pass over the corpus, not one per keystroke.
  const idf = buildIdf(people);
  const degraded = people.length > 0 && people[0].degraded;

  let results = [];
  let at = 0;

  const nodeFor = p => world.nodes[world.PPL0 + p.i];

  function clear() {
    results = [];
    at = 0;
    panel.hidden = true;
    document.body.classList.remove('answering');
    listEl.innerHTML = '';
    queryEl.textContent = '';
    countEl.textContent = '';
    emptyEl.hidden = true;
  }

  function run(question) {
    const filter = resolveQuery(question);
    const all = runQuery(filter, people, { idf, now: Date.now() });

    // A node the force simulation has not placed yet cannot be flown to.
    results = all.filter(p => nodeFor(p)?.x !== undefined);
    at = 0;

    panel.hidden = false;
    document.body.classList.add('answering');
    queryEl.innerHTML = renderQuery(filter);
    countEl.textContent = results.length
      ? `${fmt(results.length)} of ${fmt(people.length)}`
      : `0 of ${fmt(people.length)}`;

    if (!results.length) {
      listEl.innerHTML = '';
      emptyEl.hidden = false;
      emptyEl.innerHTML = filter.subjects.length || filter.functions.length || filter.facets.length || filter.terms.length
        ? 'Nobody here matches that. The query above is what it actually ran — if it read the question wrongly, rephrase towards the words people put in their headlines.'
        : 'No usable signal in that question. Try naming a field, a job function or a distinctive word.';
      ui.say('No matches');
      return;
    }

    emptyEl.hidden = true;
    render();
    land(0);
  }

  function renderQuery(filter) {
    const text = describe(filter);
    return `<span class="aq-lab">Ran</span><span class="aq-text">${esc(text)}</span>`;
  }

  function render() {
    listEl.innerHTML = results.slice(0, LIMIT).map((p, i) => row(p, i)).join('');
    [...listEl.querySelectorAll('.ares')].forEach(el => {
      el.addEventListener('click', () => land(Number(el.dataset.i)));
    });
    mark();
  }

  function row(p, i) {
    const company = p.company || '';
    // For a lot of people the headline IS the role, and printing it twice makes
    // the row look padded. Only show it when it adds something.
    const head = p.headline && !degraded && !p.headline.startsWith(p.role) ? p.headline : '';
    const why = (p.why || []).map(w => `<span class="why">${esc(w)}</span>`).join('');
    return `<button type="button" class="ares" data-i="${i}">
      <span class="ar-top"><span class="ar-name">${esc(p.name)}</span>` +
      (p.role ? `<span class="ar-role">${esc(p.role)}</span>` : '') + `</span>` +
      (company ? `<span class="ar-co">${esc(company)}</span>` : '') +
      (head ? `<span class="ar-head">${esc(head)}</span>` : '') +
      (why ? `<span class="ar-why">${why}</span>` : '') +
      `</button>`;
  }

  function mark() {
    [...listEl.querySelectorAll('.ares')].forEach((el, i) => {
      el.classList.toggle('on', i === at);
    });
  }

  function land(i) {
    at = i;
    const p = results[at];
    if (!p) return;
    const node = nodeFor(p);
    if (!node) return;
    ui.land(node, { index: at, total: results.length });
    mark();
  }

  function step(back) {
    if (results.length < 2) return;
    const n = Math.min(results.length, LIMIT);
    land((at + (back ? n - 1 : 1)) % n);
  }

  // Enter submits, and so does the native `search` event an <input
  // type="search"> fires — which also covers the little clear cross. Both can
  // land for one keypress, so the second within a frame or two is ignored.
  let lastSubmit = 0;
  function submit(back) {
    const now = Date.now();
    if (now - lastSubmit < 80) return;
    lastSubmit = now;

    const q = box.value.trim();
    if (!q) { box.dataset.ran = ''; clear(); return; }
    if (results.length && q === box.dataset.ran) step(back);
    else { box.dataset.ran = q; run(q); }
  }

  box.addEventListener('search', () => submit(false));

  box.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); submit(e.shiftKey); return; }
    if (e.key === 'Escape') {
      box.value = '';
      box.dataset.ran = '';
      clear();
      ui.clearHit();
      box.blur();
    }
  });

  if (degraded) {
    $('askHint').textContent = 'Enter runs · headlines unavailable in this build';
  }

  return { run, clear };
}
