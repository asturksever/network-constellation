// The side panel: the full picture of one person or one employer.
//
// Click a person node, an employer hub, a result row or a colleague and this
// opens on the right with everything the browser knows: role, fields, the
// employer's labelled facts, who else is there — and, on request, an enriched
// profile Claude writes from the public web.
//
// The panel never sends anything itself. Enrichment goes through research.js,
// the one documented place a person's details leave the page, and only when
// the user presses the button.

import { $, esc, fmt } from './dom.js';
import { normKey } from './enrich.js';
import { researchPerson, researchKey, parseBrief, RESEARCH_HEADINGS } from './research.js';
import { getResearch } from './store.js';
import { SEN_ORDER } from './taxonomy.js';

const MAX_COLLEAGUES = 8;
const MAX_STAFF = 40;

export function createDetail({ world, D, people, ui, getEmployers, getKey, enrichOne }) {
  const panel = $('detail');
  const body = $('detailBody');
  const kindEl = $('detailKind');
  const closeBtn = $('detailClose');

  let current = null;      // { kind: 'person', p } | { kind: 'company', name }
  let inFlight = null;     // AbortController for the Claude read
  let researching = null;  // its own controller, so the two never cancel each other

  const open = () => { panel.hidden = false; document.body.classList.add('detailing'); };

  function close() {
    inFlight?.abort();
    inFlight = null;
    researching?.abort();
    researching = null;
    current = null;
    panel.hidden = true;
    document.body.classList.remove('detailing');
  }

  closeBtn.addEventListener('click', close);
  addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) close(); });

  const personOf = node => people[node.id - world.PPL0];
  const nodeOf = p => world.nodes[world.PPL0 + p.i];
  const hubOf = name => {
    const ci = D.comps.indexOf(name);
    return ci >= 0 ? world.nodes[world.COMP0 + ci] : null;
  };
  const employerOf = name => (name ? getEmployers()?.get(normKey(name)) : null) || null;
  const rank = p => { const r = SEN_ORDER.indexOf(p.seniority); return r < 0 ? 99 : r; };

  const chips = (xs, cls = 'why') =>
    xs.length ? `<span class="d-chips">${xs.map(x => `<span class="${cls}">${esc(x)}</span>`).join('')}</span>` : '';
  const sec = (title, inner, extra = '') =>
    `<section class="d-sec"><span class="lab">${title}</span>${inner}${extra}</section>`;
  const status = (text, bad = false) => `<span class="d-status${bad ? ' bad' : ''}">${esc(text)}</span>`;
  const dateOf = t => t ? new Date(t).toLocaleDateString('en-GB', { year: 'numeric', month: 'short' }) : '';

  /* ---------- the employer block, shared by both views ---------- */

  function employerBlock(name) {
    if (!name) return '';
    const e = employerOf(name);
    if (e) {
      const where = [e.hqCity, e.hqCountry].filter(Boolean).join(', ');
      return sec('Employer · labelled by Claude',
        `<div class="d-kv"><span>Headquarters</span><span>${where ? esc(where) : '<em>unknown</em>'}</span></div>` +
        `<div class="d-kv"><span>Type</span><span>${esc(e.orgType || 'unknown')}</span></div>` +
        (e.industry ? `<div class="d-kv"><span>Industry</span><span>${esc(e.industry)}</span></div>` : '') +
        `<div class="d-kv"><span>Confidence</span><span>${esc(e.confidence || 'low')}</span></div>` +
        `<span class="d-note">This is where the organisation is based, not where any person lives.</span>`);
    }
    const can = Boolean(getKey?.());
    return sec('Employer',
      `<span class="d-note">Not labelled yet. ${can
        ? 'One name is sent to Claude; well under a cent.'
        : '<button type="button" class="linky open-settings">Add a key</button> to look it up.'}</span>` +
      (can ? `<button type="button" class="primary d-label" data-name="${esc(name).replace(/"/g, '&quot;')}">Label ${esc(name)}</button>` : ''));
  }

  function wireLabelButtons() {
    for (const b of body.querySelectorAll('.d-label')) {
      b.addEventListener('click', async () => {
        b.disabled = true;
        b.textContent = 'Asking…';
        try {
          await enrichOne(b.dataset.name);
          rerender();
        } catch (err) {
          b.disabled = false;
          b.textContent = err?.message || 'Could not label it';
        }
      });
    }
  }

  /* ---------- people rows ---------- */

  const personRow = q =>
    `<button type="button" class="drow" data-i="${q.i}">` +
    `<span class="drow-name">${esc(q.name)}</span>` +
    (q.role ? `<span class="drow-role">${esc(q.role)}</span>` : '') +
    `</button>`;

  function wirePersonRows() {
    for (const el of body.querySelectorAll('.drow')) {
      el.addEventListener('click', () => {
        const q = people[Number(el.dataset.i)];
        const n = nodeOf(q);
        // land() reaches back through the hook and opens this person.
        if (n) ui.land(n, { index: 0, total: 1 }); else showPerson(q);
      });
    }
  }

  /* ---------- a person ---------- */

  function showPerson(p) {
    if (!p) return;
    inFlight?.abort();
    researching?.abort();
    current = { kind: 'person', p };
    kindEl.textContent = 'Person';

    const di = D.doms.indexOf(p.domain);
    const others = (p.domains || []).filter(d => d !== p.domain);
    const colleagues = p.company
      ? people.filter(q => q.company === p.company && q.i !== p.i).sort((a, b) => rank(a) - rank(b))
      : [];
    const sameDomain = D.domCounts[di] || 0;
    const tag = (text, colour, title = '') =>
      `<span class="d-tag"${title ? ` title="${esc(title)}"` : ''}>` +
      (colour ? `<span class="dot" style="background:${colour}"></span>` : '') + `${esc(text)}</span>`;

    body.innerHTML =
      // who they are, at a glance
      `<div class="d-hero">` +
        `<div class="d-photo-wrap" id="dPhotoWrap"><div class="d-hero-text">` +
          `<h2 class="d-name">${esc(p.name)}</h2>` +
          (p.role ? `<div class="d-role">${esc(p.role)}</div>` : '') +
          (p.company
            ? `<button type="button" class="linky d-co" data-co="${esc(p.company).replace(/"/g, '&quot;')}">${esc(p.company)}</button>`
            : '') +
        `</div></div>` +
        `<div class="d-tags">` +
          tag(p.domain, di >= 0 ? world.domColor[di] : '', sameDomain ? `${fmt(sameDomain)} people in this field` : '') +
          (p.seniority && p.seniority !== 'Unstated' ? tag(p.seniority) : '') +
          others.map(d => tag(d, world.domColor[D.doms.indexOf(d)] || '', 'Also matches')).join('') +
        `</div>` +
        (p.slug
          ? `<a class="d-linkedin" href="https://www.linkedin.com/in/${encodeURIComponent(p.slug)}/" target="_blank" rel="noopener">View on LinkedIn ↗</a>`
          : '') +
      `</div>` +

      (p.headline && p.headline !== p.role
        ? sec('Headline', `<span class="d-text">${esc(p.headline)}</span>`)
        : '') +

      // the enrich card follows the headline, so it reads as the next step
      `<div class="d-enrich" id="dResearch"></div>` +

      employerBlock(p.company) +

      (colleagues.length
        ? sec(`Also at ${esc(p.company)} · ${fmt(colleagues.length)}`,
            colleagues.slice(0, MAX_COLLEAGUES).map(personRow).join('') +
            (colleagues.length > MAX_COLLEAGUES
              ? `<button type="button" class="linky d-more" data-co="${esc(p.company).replace(/"/g, '&quot;')}">See all ${fmt(colleagues.length)}</button>`
              : ''))
        : '') +

      (p.connectedOn ? sec('Connected since', `<span class="d-text">${esc(dateOf(p.connectedOn))}</span>`) : '');

    wireCompanyLinks();
    wirePersonRows();
    wireLabelButtons();
    open();
    body.scrollTop = 0;
    researchBlock(p, $('dResearch'));
  }

  /* ---------- enrich profile ---------- */
  /* Never automatic. This is the one action that sends a person's name
     anywhere, so it is a button that says plainly what you get, what is sent
     and what it costs. A brief already saved is shown straight away. */

  const SPARK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9z"/><path d="M19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z" opacity=".7"/></svg>`;

  async function researchBlock(p, el) {
    if (!el) return;
    // Draw the card straight away; swap in a saved brief if one turns up.
    drawEnrichCard(p, el);
    const cached = await getResearch(researchKey(p)).catch(() => null);
    if (current?.p !== p || !el.isConnected) return;   // the panel moved on
    if (cached && !el.dataset.busy) renderBrief(p, el, { ...cached, cached: true });
  }

  function drawEnrichCard(p, el) {
    el.className = 'd-enrich';
    if (!getKey?.()) {
      el.innerHTML =
        `<div class="de-head">${SPARK}<span>Enrich this profile</span></div>` +
        `<p class="de-lead">Get a short brief on who ${esc(firstName(p))} is, what they work on and how to open a conversation, written by Claude from the public web.</p>` +
        `<button type="button" class="primary de-btn open-settings">Add your API key to start</button>`;
      return;
    }
    el.innerHTML =
      `<div class="de-head">${SPARK}<span>Enrich this profile</span></div>` +
      `<p class="de-lead">Get a short brief on who ${esc(firstName(p))} is, what they work on and how to open a conversation, with a photo if one is public.</p>` +
      `<button type="button" class="primary de-btn d-research">Enrich profile</button>` +
      `<p class="de-fine">Claude searches the public web using their name, headline and employer. About $0.10–$0.30, saved afterwards.</p>`;
    el.querySelector('.d-research').addEventListener('click', () => fetchResearch(p, el, false));
  }

  const firstName = p => (p.name || '').split(/\s+/)[0] || 'this person';

  async function fetchResearch(p, el, force) {
    const key = getKey?.();
    if (!key) return;
    researching?.abort();
    const controller = new AbortController();
    researching = controller;
    el.dataset.busy = '1';
    el.className = 'd-enrich busy';

    const started = Date.now();
    el.innerHTML =
      `<div class="de-head">${SPARK}<span>Enriching profile…</span><span class="de-clock" id="deClock">0:00</span></div>` +
      `<div class="de-track"><span></span></div>` +
      `<p class="de-fine">Searching the public web and writing the brief. Usually under two minutes. You can keep exploring; it will appear here.</p>` +
      `<button type="button" class="linky de-cancel">Cancel</button>`;
    const clock = setInterval(() => {
      const t = Math.floor((Date.now() - started) / 1000);
      const c = el.querySelector('#deClock');
      if (c) c.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    }, 1000);
    el.querySelector('.de-cancel').addEventListener('click', () => {
      controller.abort();
      drawEnrichCard(p, el);
    });

    try {
      const r = await researchPerson({
        apiKey: key, person: p, employer: employerOf(p.company), signal: controller.signal, force
      });
      if (controller.signal.aborted) return;
      renderBrief(p, el, r);
      ui.say(`${p.name} · profile enriched`);
    } catch (err) {
      if (controller.signal.aborted) return;
      el.className = 'd-enrich failed';
      el.innerHTML =
        `<div class="de-head">${SPARK}<span>Couldn’t enrich this profile</span></div>` +
        `<p class="de-lead">${esc(err?.message || 'The search did not complete.')}</p>` +
        `<button type="button" class="primary de-btn d-again">Try again</button>`;
      el.querySelector('.d-again')?.addEventListener('click', () => fetchResearch(p, el, true));
    } finally {
      clearInterval(clock);
      if (researching === controller) researching = null;
      delete el.dataset.busy;
    }
  }

  const briefText = t => esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>');

  /** A public photo found by the research, ahead of the name. Removed if it fails to load. */
  function showPhoto(url) {
    const wrap = $('dPhotoWrap');
    if (!wrap || !url || wrap.querySelector('.d-photo')) return;
    const img = document.createElement('img');
    img.className = 'd-photo';
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => img.remove());
    img.src = url;
    wrap.prepend(img);
  }

  // Plain-language headings, in the order a reader wants them: who, how to
  // open, then the detail.
  const BRIEF_ORDER = [
    ['Identity', 'Who they are'],
    ['Approach', 'Conversation starters'],
    ['Role', 'What they do'],
    ['Organisation', 'Their organisation'],
    ['Track record', 'Background'],
    ['Signals', 'What they’re focused on']
  ];

  function renderBrief(p, el, r) {
    const { sections } = parseBrief(r.text);
    if (r.photo) showPhoto(r.photo);
    const conf = r.confidence || 'low';
    const confLabel = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' }[conf] || 'Unrated';

    const parts = [];
    parts.push(
      `<div class="de-head">${SPARK}<span>Enriched profile</span>` +
      `<span class="de-conf de-conf-${conf}" title="${esc(sections.confidenceWhy || '')}">${confLabel}</span></div>`);
    if (sections.preamble) parts.push(`<p class="de-warn">${briefText(sections.preamble)}</p>`);
    for (const [key, label] of BRIEF_ORDER) {
      if (!sections[key]) continue;
      parts.push(
        `<div class="de-sec${key === 'Approach' ? ' de-approach' : ''}">` +
        `<span class="de-h">${esc(label)}</span><p>${briefText(sections[key])}</p></div>`);
    }
    if (sections.confidenceWhy) parts.push(`<p class="de-fine">${esc(sections.confidenceWhy)}</p>`);
    if (r.sources?.length) {
      parts.push(`<details class="de-sources"><summary>${r.sources.length} source${r.sources.length === 1 ? '' : 's'}</summary><ol>` +
        r.sources.map(src => {
          let host = '';
          try { host = new URL(src.url).hostname.replace(/^www\./, ''); } catch { /* keep blank */ }
          return `<li><a href="${esc(src.url).replace(/"/g, '&quot;')}" target="_blank" rel="noopener">${esc(src.title)}</a>` +
            (host ? ` <span class="d-dim">${esc(host)}</span>` : '') + `</li>`;
        }).join('') + `</ol></details>`);
    }
    if (r.searchErrors?.length) {
      parts.push(`<p class="de-fine">Some searches did not run, so this may be thinner than usual.</p>`);
    }
    parts.push(
      `<p class="de-fine">Enriched ${esc(dateOf(r.researchedAt))} · ` +
      (r.cached ? 'saved, no cost' : `$${(r.cost || 0).toFixed(2)}`) +
      ` · <button type="button" class="linky d-again">Refresh</button></p>`);

    el.className = 'd-enrich done';
    el.innerHTML = parts.join('');
    el.querySelector('.d-again')?.addEventListener('click', () => fetchResearch(p, el, true));
  }

  function wireCompanyLinks() {
    for (const el of body.querySelectorAll('.d-co, .d-more')) {
      el.addEventListener('click', () => showCompany(el.dataset.co, { fly: true }));
    }
  }


  /* ---------- a company ---------- */

  function showCompany(name, { fly = false } = {}) {
    if (!name) return;
    inFlight?.abort();
    researching?.abort();
    current = { kind: 'company', name };
    kindEl.textContent = 'Employer';

    const staff = people.filter(q => q.company === name).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    const hub = hubOf(name);

    const senCounts = SEN_ORDER.map(s => staff.filter(q => q.seniority === s).length);
    const senMax = Math.max(1, ...senCounts);
    const senBars = SEN_ORDER.map((s, i) => senCounts[i]
      ? `<div class="d-bar"><span class="d-bar-k">${esc(s)}</span>` +
        `<span class="d-bar-t"><span style="width:${Math.round((senCounts[i] / senMax) * 100)}%"></span></span>` +
        `<span class="d-bar-n">${fmt(senCounts[i])}</span></div>`
      : '').join('');

    const domCount = new Map();
    for (const q of staff) domCount.set(q.domain, (domCount.get(q.domain) || 0) + 1);
    const doms = [...domCount.entries()].sort((a, b) => b[1] - a[1]).map(([d, n]) => `${d} · ${n}`);

    body.innerHTML =
      `<h2 class="d-name">${esc(name)}</h2>` +
      `<div class="d-meta">${fmt(staff.length)} ${staff.length === 1 ? 'person' : 'people'} in your network` +
      (hub ? '' : ' <span class="d-dim">· too few for a hub</span>') + `</div>` +
      (hub ? `<button type="button" class="linky" id="dFly">Fly to the hub</button>` : '') +

      employerBlock(name) +

      (staff.length > 1 ? sec('Seniority', senBars) : '') +
      (doms.length ? sec('Domains', chips(doms)) : '') +
      sec(`People · ${fmt(staff.length)}`,
        staff.slice(0, MAX_STAFF).map(personRow).join('') +
        (staff.length > MAX_STAFF ? `<span class="d-note">and ${fmt(staff.length - MAX_STAFF)} more</span>` : ''));

    wirePersonRows();
    wireLabelButtons();
    $('dFly')?.addEventListener('click', () => { if (hub) world.flyTo(hub, 130); });
    open();
    body.scrollTop = 0;
    if (fly && hub) world.flyTo(hub, 130);
  }

  function rerender() {
    if (!current) return;
    if (current.kind === 'person') showPerson(current.p);
    else showCompany(current.name);
  }

  return {
    showPerson,
    showCompany,
    showNode(n) {
      if (n.t === 'p') showPerson(personOf(n));
      else if (n.t === 'comp') showCompany(n.name);
    },
    close,
    rerender,
    get open() { return !panel.hidden; }
  };
}
