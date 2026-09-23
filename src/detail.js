// The side panel: the full picture of one person or one employer.
//
// Click a person node, an employer hub, a result row or a colleague and this
// opens on the right with everything the browser knows: the classification,
// every matched domain, the employer's labelled facts, who else is there, and
// — when a key is saved and the switch is on — Claude's read of the headline.
//
// Two rules. Everything shown is labelled with where it came from, because a
// reader has to be able to tell a fact in the export from an inference. And
// the panel never sends anything itself: the per-person read goes through
// personllm.js, which is the one documented place that text leaves the page.

import { $, esc, fmt } from './dom.js';
import { normKey } from './enrich.js';
import { readPerson } from './personllm.js';
import { SEN_ORDER } from './taxonomy.js';

const MAX_COLLEAGUES = 8;
const MAX_STAFF = 40;

export function createDetail({ world, D, people, ui, getEmployers, getKey, autoPerson, enrichOne }) {
  const panel = $('detail');
  const body = $('detailBody');
  const kindEl = $('detailKind');
  const closeBtn = $('detailClose');

  let current = null;      // { kind: 'person', p } | { kind: 'company', name }
  let inFlight = null;     // AbortController for the Claude read

  const open = () => { panel.hidden = false; document.body.classList.add('detailing'); };

  function close() {
    inFlight?.abort();
    inFlight = null;
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
        : 'Add a key under Enrich with Claude to look it up.'}</span>` +
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
    current = { kind: 'person', p };
    kindEl.textContent = 'Person';

    const others = (p.domains || []).filter(d => d !== p.domain);
    const colleagues = p.company
      ? people.filter(q => q.company === p.company && q.i !== p.i).sort((a, b) => rank(a) - rank(b))
      : [];
    const sameDomain = D.domCounts[D.doms.indexOf(p.domain)] || 0;

    body.innerHTML =
      `<h2 class="d-name">${esc(p.name)}</h2>` +
      (p.role ? `<div class="d-role">${esc(p.role)}</div>` : '') +
      (p.company
        ? `<button type="button" class="linky d-co" data-co="${esc(p.company).replace(/"/g, '&quot;')}">${esc(p.company)}</button>`
        : '') +
      `<div class="d-meta">${esc(p.seniority)} · ${esc(p.domain)}` +
      (sameDomain ? ` <span class="d-dim">· one of ${fmt(sameDomain)}</span>` : '') + `</div>` +
      chips(others) +
      (p.slug
        ? `<a class="d-go" href="https://www.linkedin.com/in/${encodeURIComponent(p.slug)}/" target="_blank" rel="noopener">Open profile ↗</a>`
        : `<span class="d-note">No profile link in the export.</span>`) +

      (p.headline && p.headline !== p.role
        ? sec('Headline · from the export', `<span class="d-text">${esc(p.headline)}</span>`)
        : '') +

      employerBlock(p.company) +

      (colleagues.length
        ? sec(`Also at ${esc(p.company)} · ${fmt(colleagues.length)}`,
            colleagues.slice(0, MAX_COLLEAGUES).map(personRow).join('') +
            (colleagues.length > MAX_COLLEAGUES
              ? `<button type="button" class="linky d-more" data-co="${esc(p.company).replace(/"/g, '&quot;')}">See all ${fmt(colleagues.length)}</button>`
              : ''))
        : '') +

      sec("Claude's read · from the headline", `<div id="dRead"></div>`) +

      (p.connectedOn ? sec('Connected', `<span class="d-text">${esc(dateOf(p.connectedOn))}</span>`) : '');

    wireCompanyLinks();
    wirePersonRows();
    wireLabelButtons();
    open();
    body.scrollTop = 0;
    claudeRead(p, $('dRead'));
  }

  function wireCompanyLinks() {
    for (const el of body.querySelectorAll('.d-co, .d-more')) {
      el.addEventListener('click', () => showCompany(el.dataset.co, { fly: true }));
    }
  }

  async function claudeRead(p, el) {
    if (!el) return;
    const key = getKey?.();
    if (!key) { el.innerHTML = status('Add a key under Enrich with Claude to get a read of this headline.'); return; }
    if (!autoPerson?.()) {
      el.innerHTML = `<button type="button" class="linky" id="dAsk">Ask Claude about this person</button>` +
        `<span class="d-note">Sends the role, headline and employer name. Not the name, link or email.</span>`;
      $('dAsk')?.addEventListener('click', () => { el.innerHTML = ''; fetchRead(p, el, key); });
      return;
    }
    fetchRead(p, el, key);
  }

  async function fetchRead(p, el, key) {
    const controller = new AbortController();
    inFlight = controller;
    el.innerHTML = status('asking claude…');
    try {
      const r = await readPerson({ apiKey: key, person: p, employer: employerOf(p.company), signal: controller.signal });
      if (controller.signal.aborted) return;
      el.innerHTML =
        `<span class="d-text">${esc(r.summary)}</span>` +
        (r.likelyWorksOn.length ? `<span class="d-sub">Likely works on</span>${chips(r.likelyWorksOn)}` : '') +
        (r.couldHelpWith.length ? `<span class="d-sub">Could help with</span>${chips(r.couldHelpWith)}` : '') +
        `<span class="d-note">Reads as ${esc(r.seniorityRead)} · confidence ${esc(r.confidence)} · ` +
        (r.cached ? 'from an earlier read, no cost' : `$${r.cost.toFixed(4)}`) + `</span>`;
    } catch (err) {
      if (controller.signal.aborted) return;
      el.innerHTML = status(err?.message || 'Claude could not read this one.', true);
    } finally {
      if (inFlight === controller) inFlight = null;
    }
  }

  /* ---------- a company ---------- */

  function showCompany(name, { fly = false } = {}) {
    if (!name) return;
    inFlight?.abort();
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
