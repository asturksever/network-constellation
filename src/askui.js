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
import { resolveQuery, runQuery, describe, buildIdf, mergeFilter } from './ask.js';
import { understandQuestion } from './askllm.js';

const LIMIT = 12;

export function wireAsk({ world, D, people, ui }) {
  // Set by main.js once the key panel exists; until then there is simply no key.
  const api = {};
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
  let landed = false;       // has the marker been put on a result yet?
  let employers = null;     // employer key -> { hqCity, orgType, ... }
  let inFlight = null;      // AbortController for the question-understanding call

  const setEmployers = m => { employers = m; };

  const nodeFor = p => world.nodes[world.PPL0 + p.i];

  function clear() {
    results = [];
    at = 0;
    landed = false;
    world.setHits(null);
    panel.hidden = true;
    document.body.classList.remove('answering');
    listEl.innerHTML = '';
    queryEl.textContent = '';
    countEl.textContent = '';
    emptyEl.hidden = true;
  }

  /**
   * Runs immediately on the regex filter, then — only if a key is present —
   * asks Claude to read the question again and re-runs with whatever it added.
   * The first answer is never withheld waiting for the second.
   */
  function run(question) {
    const base = resolveQuery(question);
    show(base, question);

    if (!api.enrichment?.hasKey()) return;

    inFlight?.abort();
    inFlight = new AbortController();
    const controller = inFlight;
    panel.classList.add('thinking');

    understandQuestion({ apiKey: api.enrichment.key, question, signal: controller.signal })
      .then(u => {
        if (controller.signal.aborted || box.dataset.ran !== question) return;
        show(mergeFilter(base, u.ext), question, u.interpretation);
      })
      .catch(err => {
        // The regex answer is already on screen, so this is a footnote, not a
        // failure. Auth problems are worth surfacing; the rest are not.
        if (err?.code === 'auth') ui.say(err.message);
        console.warn('Question understanding unavailable:', err);
      })
      .finally(() => { if (!controller.signal.aborted) panel.classList.remove('thinking'); });
  }

  function show(filter, question, interpretation) {
    const all = runQuery(filter, people, { idf, now: Date.now(), enrich: employers });
    const excluded = all.excludedForLocation || 0;

    // A node the force simulation has not placed yet cannot be flown to.
    results = all.filter(p => nodeFor(p)?.x !== undefined);
    at = 0;

    panel.hidden = false;
    document.body.classList.add('answering');
    queryEl.innerHTML = renderQuery(filter, interpretation);
    renderCaveat(filter, excluded);
    countEl.textContent = results.length
      ? `${fmt(results.length)} of ${fmt(people.length)}`
      : `0 of ${fmt(people.length)}`;

    if (!results.length) {
      listEl.innerHTML = '';
      emptyEl.hidden = false;
      at = 0;
      emptyEl.innerHTML = filter.subjects.length || filter.functions.length || filter.facets.length || filter.terms.length
        ? 'Nobody here matches that. The query above is what it actually ran — if it read the question wrongly, rephrase towards the words people put in their headlines.'
        : 'No usable signal in that question. Try naming a field, a job function or a distinctive word.';
      ui.say('No matches');
      return;
    }

    emptyEl.hidden = true;
    render();
    light();
  }

  /**
   * Every match lit in the scene at once, everyone else dimmed, and the camera
   * pulled back to frame the set. Nobody is landed on yet: the list is the
   * answer, and the marker waits for Enter or a click.
   */
  function light() {
    landed = false;
    api.detail?.close?.();
    const nodes = new Set(results.map(nodeFor).filter(Boolean));
    // people hidden by the density control cannot light up; put them back first
    const restored = results.some(p => !world.isVisible(nodeFor(p))) && ui.showEveryone();
    world.setHit(null);
    world.setHits(nodes);
    const frame = () => world.frameNodes([...nodes]);
    if (restored) setTimeout(frame, 450); else frame();
    ui.say(`${fmt(results.length)} lit · Enter steps through them`);
  }

  function renderQuery(filter, interpretation) {
    const [line, added] = describe(filter).split('\n');
    return `<span class="aq-lab">Ran</span><span class="aq-text">${esc(line)}</span>` +
      (added ? `<span class="aq-added">${esc(added)}</span>` : '') +
      (interpretation ? `<span class="aq-read">&ldquo;${esc(interpretation)}&rdquo;</span>` : '');
  }

  /**
   * Location here is the EMPLOYER's headquarters, not where the person lives —
   * a London engineer at a San Francisco company matches "based in SF". Saying
   * so every time is the difference between a useful answer and a map made of
   * guesses. The excluded count goes with it: a location filter drops everyone
   * whose employer could not be placed, and hiding that would make a thin
   * shortlist look like a complete one.
   */
  function renderCaveat(filter, excluded) {
    const el = $('askCaveat');
    if (!filter.location) { el.hidden = true; el.innerHTML = ''; return; }

    if (filter.location.source === 'hint' && !employers?.size) {
      el.hidden = false;
      el.innerHTML = '<strong>Location was not applied.</strong> Your export has no ' +
        'location in it. <button type="button" class="linky open-settings">Add an API key</button> ' +
        'to look up where employers are based.';
      return;
    }
    el.hidden = false;
    el.innerHTML = '<strong>Location is the employer’s headquarters</strong>, not where ' +
      'the person lives.' +
      (excluded ? ` ${fmt(excluded)} people were excluded because their employer could not be placed.` : '');
  }

  function render() {
    listEl.innerHTML = results.slice(0, LIMIT).map((p, i) => row(p, i)).join('');
    [...listEl.querySelectorAll('.ares')].forEach(el => {
      el.addEventListener('click', () => land(Number(el.dataset.i), false));
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

  /** `auto` is a landing nobody chose (Enter-stepping); a click is not. */
  function land(i, auto = true) {
    at = i;
    const p = results[at];
    if (!p) return;
    const node = nodeFor(p);
    if (!node) return;
    landed = true;
    // Stepping through the list while a profile is open closes the profile,
    // which brings the answer back into view; a click opens the next one.
    if (auto) api.detail?.close?.();
    ui.land(node, { index: at, total: results.length, auto });
    mark();
  }

  function step(back) {
    if (!results.length) return;
    if (!landed) { land(0); return; }
    land((at + (back ? results.length - 1 : 1)) % results.length);
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

  Object.assign(api, {
    run, clear, setEmployers,
    detail: null,
    set enrichment(v) { api._enrich = v; },
    get enrichment() { return api._enrich; }
  });
  return api;
}
