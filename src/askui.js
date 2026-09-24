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
import { SEN_ORDER } from './taxonomy.js';
import { understandQuestion } from './askllm.js';

const PAGE = 12;            // rows drawn at a time; "Show more" adds another page

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
  let shown = PAGE;         // how many rows are drawn
  let lastFilter = null;    // for highlighting matched words in each row
  let landed = false;       // has the marker been put on a result yet?
  let employers = null;     // employer key -> { hqCity, orgType, ... }
  let inFlight = null;      // AbortController for the question-understanding call
  let touched = false;      // has the user done anything since the answer appeared?
  let employersSeen = 0;    // bumped whenever the employer map changes...
  let ranWith = -1;         // ...and what it was when the showing answer ran

  // New employer records can change an answer (a location or organisation
  // type now resolves), so the same question must run again, not step.
  const setEmployers = m => { employers = m; employersSeen++; };

  /** Stop waiting for Claude's reading of a question nobody is looking at any more. */
  function stopThinking() {
    inFlight?.abort();
    inFlight = null;
    panel.classList.remove('thinking');
  }

  const nodeFor = p => world.nodes[world.PPL0 + p.i];

  // Orbiting or clicking the scene counts as doing something: a second answer
  // arriving afterwards must not yank the camera away from where it was put.
  world.graph.renderer().domElement.addEventListener('pointerdown', () => { touched = true; });

  $('askMore').addEventListener('click', () => { shown += PAGE; render(); });

  /** Nothing lit, nobody marked, no rows: what an empty answer leaves behind. */
  function unlight() {
    results = [];
    at = 0;
    landed = false;
    world.setHits(null);
    world.setHit(null);
    ui.clearHit();
    listEl.innerHTML = '';
    $('askMore').hidden = true;
  }

  function clear() {
    stopThinking();
    unlight();
    panel.hidden = true;
    document.body.classList.remove('answering');
    queryEl.textContent = '';
    countEl.textContent = '';
    $('askSub').textContent = '';
    emptyEl.hidden = true;
  }

  /**
   * Runs immediately on the regex filter, then — only if a key is present —
   * asks Claude to read the question again and re-runs with whatever it added.
   * The first answer is never withheld waiting for the second.
   */
  function run(question) {
    stopThinking();
    const base = resolveQuery(question);
    ranWith = employersSeen;
    show(base, question);

    if (!api.enrichment?.hasKey()) return;

    inFlight = new AbortController();
    const controller = inFlight;
    panel.classList.add('thinking');

    understandQuestion({ apiKey: api.enrichment.key, question, signal: controller.signal })
      .then(u => {
        if (controller.signal.aborted || box.dataset.ran !== question) return;
        // If the user has clicked a result, opened a profile or moved the
        // camera while Claude was reading, the better answer is drawn in
        // place: the list and the lit set change, the view and panel do not.
        show(mergeFilter(base, u.ext), question, u.interpretation, { quiet: touched });
      })
      .catch(err => {
        // The regex answer is already on screen, so this is a footnote, not a
        // failure. Auth problems are worth surfacing; the rest are not.
        if (controller.signal.aborted || err?.code === 'cancelled') return;
        if (err?.code === 'auth') ui.say(err.message);
        console.warn('Question understanding unavailable:', err);
      })
      .finally(() => { if (!controller.signal.aborted) panel.classList.remove('thinking'); });
  }

  function show(filter, question, interpretation, { quiet = false } = {}) {
    const all = runQuery(filter, people, { idf, now: Date.now(), enrich: employers });
    const excluded = all.excludedForLocation || 0;
    const was = landed ? results[at] : null;

    // A node the force simulation has not placed yet cannot be flown to.
    results = all.filter(p => nodeFor(p)?.x !== undefined);
    at = 0;
    shown = PAGE;
    lastFilter = filter;
    if (!quiet) touched = false;

    panel.hidden = false;
    document.body.classList.add('answering');
    queryEl.innerHTML = renderQuery(filter, interpretation);
    queryEl.title = describe(filter).replace('\n', ' \u00b7 ');
    renderCaveat(filter, excluded);
    // The count is the answer, so it is the headline.
    const pct = people.length ? (results.length / people.length) * 100 : 0;
    countEl.textContent = results.length === 1 ? '1 person' : `${fmt(results.length)} people`;
    $('askSub').textContent = results.length
      ? `${pct < 1 ? '<1' : Math.round(pct)}% of your network`
      : 'in your network';

    if (!results.length) {
      // the previous answer's lit set and rows must not outlive it
      unlight();
      emptyEl.hidden = false;
      emptyEl.innerHTML = filter.subjects.length || filter.functions.length || filter.facets.length || filter.terms.length
        ? 'Nobody here matches that. The query above is what it actually ran — if it read the question wrongly, rephrase towards the words people put in their headlines.'
        : 'No usable signal in that question. Try naming a field, a job function or a distinctive word.';
      ui.say('No matches');
      return;
    }

    emptyEl.hidden = true;
    if (quiet) {
      // keep the person the user was on, if the better answer still has them
      const i = was ? results.findIndex(r => r.i === was.i) : -1;
      landed = i >= 0;
      at = Math.max(0, i);
      if (at >= shown) shown = Math.ceil((at + 1) / PAGE) * PAGE;
      render();
      world.setHits(new Set(results.map(nodeFor).filter(Boolean)));
      return;
    }
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

  /**
   * How the question was matched, in plain parts rather than a code line. The
   * same information describe() prints — kept whole in the tooltip — because a
   * shortlist you cannot audit is one you cannot trust. Words Claude added are
   * marked, so they are as visible as the ones taken from the question.
   */
  function renderQuery(filter, interpretation) {
    const added = new Set([...(filter.added?.terms || []), ...(filter.added?.domains || []), ...(filter.added?.facets || [])]);
    const mark = x => added.has(x) ? ' aq-claude' : '';
    const part = (label, values, cls = '') => values.length
      ? `<div class="aq-row"><span class="aq-k">${label}</span><span class="aq-v">` +
        values.map(v => `<span class="aq-chip${cls}${mark(v)}">${esc(v)}</span>`).join('') + `</span></div>`
      : '';
    const where = filter.location
      ? [...(filter.location.cities || []), ...(filter.location.countries || []), ...(filter.location.regions || [])].slice(0, 3)
      : [];
    const words = filter.terms || [];
    return (interpretation ? `<p class="aq-read">${esc(interpretation)}</p>` : '') +
      part('Field', filter.subjects) +
      part('Role', [...filter.functions, ...filter.facets]) +
      (filter.minRank != null ? part('Seniority', [`${SEN_ORDER[filter.minRank]} or above`]) : '') +
      part('Employer', filter.orgTypes || []) +
      part('Based in', where.map(w => `${w} (employer HQ)`)) +
      part('Mentions', words.slice(0, 8)) +
      (added.size ? `<p class="aq-note"><span class="aq-spark">✦</span> added by Claude</p>` : '') +
      (!filter.subjects.length && !filter.functions.length && !filter.facets.length && !words.length && !where.length
        ? `<p class="aq-note">No usable signal in the question.</p>` : '');
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
    const n = Math.min(shown, results.length);
    listEl.innerHTML = results.slice(0, n).map((p, i) => row(p, i)).join('');
    [...listEl.querySelectorAll('.ares')].forEach(el => {
      el.addEventListener('click', () => land(Number(el.dataset.i), false));
    });
    const more = $('askMore');
    const left = results.length - n;
    more.hidden = left <= 0;
    more.textContent = left > 0 ? `Show ${fmt(Math.min(PAGE, left))} more · ${fmt(left)} left` : '';
    mark();
  }

  /** Wrap the question's words where they occur, so a row shows why it matched. */
  function highlight(text) {
    const words = (lastFilter?.terms || []).filter(w => w.length > 2)
      .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!words.length || !text) return esc(text || '');
    const re = new RegExp(`\\b(${words.join('|')})\\w*`, 'gi');
    let out = '', last = 0, m;
    while ((m = re.exec(text)) !== null) {
      out += esc(text.slice(last, m.index)) + `<mark>${esc(m[0])}</mark>`;
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  }

  const initials = name => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2)
    .map(w => w[0].toUpperCase()).join('');

  function row(p, i) {
    const di = D.doms.indexOf(p.domain);
    const colour = di >= 0 ? world.domColor[di] : '#636366';
    const subtitle = [p.role, p.company].filter(Boolean).join(' · ');
    // The role is usually the headline's first clause; show whatever the
    // headline adds beyond it, which is often where the matched words are.
    let head = !degraded && p.headline ? p.headline : '';
    if (head && p.role && head.startsWith(p.role)) head = head.slice(p.role.length).replace(/^[\s|•·,@–—-]+/, '');
    if (head && p.company && head.replace(/^at\s+/i, '').trim() === p.company) head = '';
    // Only the reasons that say something the question did not: the field the
    // question asked for, and the words already highlighted, are dropped.
    const asked = new Set(lastFilter?.subjects || []);
    const tags = (p.why || []).filter(w => !asked.has(w) && !w.includes(' + ') &&
      !(lastFilter?.terms || []).includes(w.toLowerCase()));
    return `<div role="listitem"><button type="button" class="ares" data-i="${i}">` +
      `<span class="ar-avatar" style="--c:${colour}">${esc(initials(p.name))}</span>` +
      `<span class="ar-body">` +
        `<span class="ar-name">${esc(p.name)}</span>` +
        (subtitle ? `<span class="ar-sub">${highlight(subtitle)}</span>` : '') +
        (head ? `<span class="ar-head">${highlight(head)}</span>` : '') +
        (tags.length ? `<span class="ar-tags">${tags.map(t => `<span class="ar-tag">${esc(t)}</span>`).join('')}</span>` : '') +
      `</span>` +
      `<span class="ar-go" aria-hidden="true">›</span>` +
      `</button></div>`;
  }

  function mark() {
    [...listEl.querySelectorAll('.ares')].forEach((el, i) => {
      el.classList.toggle('on', landed && i === at);
    });
    const on = listEl.querySelector('.ares.on');
    if (on) on.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /** `auto` is a landing nobody chose (Enter-stepping); a click is not. */
  function land(i, auto = true) {
    at = i;
    const p = results[at];
    if (!p) return;
    const node = nodeFor(p);
    if (!node) return;
    landed = true;
    touched = true;
    // stepping past the drawn rows draws the next page, so the marked row is always visible
    if (at >= shown) { shown = Math.ceil((at + 1) / PAGE) * PAGE; render(); }
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
    if (results.length && q === box.dataset.ran && ranWith === employersSeen) step(back);
    else { box.dataset.ran = q; run(q); }
  }

  box.addEventListener('search', () => submit(false));

  /** Put the question away: box, answer, lit set and marker. */
  function dismiss() {
    box.value = '';
    box.dataset.ran = '';
    clear();
    ui.clearHit();
  }

  box.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); submit(e.shiftKey); return; }
    if (e.key === 'Escape') { dismiss(); box.blur(); }
  });
  // a phone has no Escape key, and the panel deserves a way out anyway
  $('answerClose').addEventListener('click', dismiss);

  if (degraded) {
    $('askHint').textContent = 'Enter runs · headlines unavailable in this build';
  }

  /** Put a question in the box and run it, as if it had been typed. */
  function ask(question) {
    box.value = question;
    box.dataset.ran = question;
    run(question);
  }

  Object.assign(api, {
    run, ask, clear, setEmployers,
    detail: null,
    set enrichment(v) { api._enrich = v; },
    get enrichment() { return api._enrich; }
  });
  return api;
}
