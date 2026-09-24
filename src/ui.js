// Control panel, tooltip and status line. Everything here talks to the world
// object returned by createConstellation and knows nothing about three.js.

import { fmt, esc, $ } from './dom.js';

export function wireUI(world, D, hit) {
  /* ---- tooltip ---- */
  const tip = $('tip');
  const scene = $('scene');

  world.graph.onNodeHover(n => {
    scene.style.cursor = n && n.t === 'p' && n.slug ? 'pointer' : 'default';
    if (!n) { tip.classList.remove('on'); return; }
    tip.innerHTML = tipHtml(n, D);
    tip.classList.add('on');
  });

  document.addEventListener('mousemove', e => {
    if (!tip.classList.contains('on')) return;
    let x = e.clientX + 16, y = e.clientY + 16;
    if (x + tip.offsetWidth > innerWidth - 8) x = e.clientX - tip.offsetWidth - 16;
    if (y + tip.offsetHeight > innerHeight - 8) y = e.clientY - tip.offsetHeight - 16;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  });

  // Whoever wants to know when a person or employer is clicked or landed on.
  // The detail panel registers here; without it, a person click opens their
  // profile as it always did.
  const hooks = { node: null, landed: null };

  world.graph.onNodeClick(n => {
    if ((n.t === 'p' || n.t === 'comp') && hooks.node) {
      if (n.t === 'p') world.flyTo(n, 90);
      hooks.node(n);
      return;
    }
    if (n.t === 'p' && n.slug) {
      window.open('https://www.linkedin.com/in/' + n.slug + '/', '_blank', 'noopener');
      return;
    }
    if (n.t === 'dom') {
      const next = world.state.isolate === n.di ? -1 : n.di;
      $('domSel').value = String(next);
      world.setIsolate(next);
      markLegend(next);
      return;
    }
    world.flyTo(n, n.t === 'comp' ? 130 : 90);
  });

  /* ---- density ---- */
  const segButtons = [...document.querySelectorAll('#densitySeg button')];
  segButtons.forEach(b => b.addEventListener('click', () => {
    segButtons.forEach(o => o.setAttribute('aria-pressed', String(o === b)));
    world.setDensity(b.dataset.d);
    say('Settling...');
  }));

  /* ---- colour by ---- */
  const colorButtons = [...document.querySelectorAll('#colorSeg button')];
  colorButtons.forEach(b => b.addEventListener('click', () => {
    colorButtons.forEach(o => o.setAttribute('aria-pressed', String(o === b)));
    world.setColorBy(b.dataset.c);
    drawLegend(b.dataset.c);
  }));

  /* ---- isolate ---- */
  const sel = $('domSel');
  D.doms.forEach((name, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = `${name}  (${fmt(D.domCounts[i])})`;
    sel.appendChild(o);
  });
  sel.addEventListener('change', () => {
    const di = parseInt(sel.value, 10);
    world.setIsolate(di);
    markLegend(di);
  });

  /* ---- employer links ---- */
  $('compToggle').addEventListener('change', e => {
    world.setShowComp(e.target.checked);
    say('Settling...');
  });

  /* ---- search ----
     A hit is one dot in ten thousand, so finding it has to announce itself:
     the node burns hot, its two spokes light up, and the marker overlay locks
     on. Enter steps through the rest of the matches. */
  const search = $('search');
  let timer = null;
  let matches = [];
  let at = 0;

  /**
   * Fly to a person and lock the marker on them. The name search and the Ask
   * panel both come through here — one camera path, one marker, one status
   * line, so the two features can never drift apart.
   */
  /** Put every person back in the scene, and keep the density control honest. */
  function showEveryone() {
    if (world.state.density === 'all') return false;
    segButtons.forEach(o => o.setAttribute('aria-pressed', String(o.dataset.d === 'all')));
    world.setDensity('all');
    return true;
  }

  function land(n, ctx) {
    const index = ctx?.index ?? at;
    const total = ctx?.total ?? matches.length;
    world.setHit(n);
    if (!world.isVisible(n)) {
      // the person is filtered out of the scene — put them back before flying
      showEveryone();
      setTimeout(() => { if (world.hit === n) { world.swoopTo(n); hit.show(n); } }, 420);
    } else {
      world.swoopTo(n);
      hit.show(n);
    }
    say(n.name + (total > 1
      ? `  ·  ${index + 1} of ${total}, Enter for next`
      : '  ·  found'));
    // ctx.auto marks a landing nobody chose — a question's first result, a
    // keystroke in the name search. Those keep the marker but do not open the
    // side panel; an explicit click does.
    hooks.landed?.(n, ctx);
  }

  function clearHit() {
    matches = [];
    at = 0;
    world.setHit(null);
    hit.clear();
  }

  search.addEventListener('input', () => {
    clearTimeout(timer);
    const q = search.value.trim();
    if (q.length < 2) { clearHit(); return; }
    timer = setTimeout(() => {
      matches = world.findPeople(q).filter(n => n.x !== undefined);
      at = 0;
      if (!matches.length) { clearHit(); say('No one here matches "' + q + '"'); return; }
      land(matches[0], { auto: true });
    }, 240);
  });

  search.addEventListener('keydown', e => {
    if (e.key === 'Enter' && matches.length > 1) {
      e.preventDefault();
      at = (at + (e.shiftKey ? matches.length - 1 : 1)) % matches.length;
      land(matches[at], { auto: true });
    }
    if (e.key === 'Escape') { search.value = ''; clearHit(); search.blur(); }
  });

  addEventListener('keydown', e => {
    if (e.key === 'Escape' && world.hit) { search.value = ''; clearHit(); }
  });

  /* ---- legend ---- */
  const legend = $('legend');

  function drawLegend(mode) {
    $('legendLab').textContent = mode === 'seniority' ? 'Seniority' : 'Domains';
    legend.innerHTML = '';

    if (mode === 'seniority') {
      D.sen.forEach((name, i) => {
        legend.insertAdjacentHTML('beforeend', row(world.senColor[i], name, D.senCounts[i]));
      });
      legend.insertAdjacentHTML('beforeend',
        row(world.PALETTE.compHub, 'Employer hub', D.comps.length));
      return;
    }

    // domains, largest first, each a button that isolates it
    D.doms.forEach((name, i) => {
      legend.insertAdjacentHTML('beforeend',
        row(world.domColor[i], name, D.domCounts[i], i));
    });
    legend.insertAdjacentHTML('beforeend',
      row(world.PALETTE.compHub, 'Employer hub', D.comps.length));

    legend.querySelectorAll('[data-di]').forEach(el => {
      el.addEventListener('click', () => {
        const di = parseInt(el.dataset.di, 10);
        const next = world.state.isolate === di ? -1 : di;
        sel.value = String(next);
        world.setIsolate(next);
        markLegend(next);
      });
    });
    markLegend(world.state.isolate);
  }

  function markLegend(di) {
    legend.querySelectorAll('[data-di]').forEach(el => {
      el.classList.toggle('sel', parseInt(el.dataset.di, 10) === di);
    });
  }

  drawLegend('domain');

  /* ---- stats + status ---- */
  world.onStats(s => {
    $('nNodes').textContent = fmt(s.nodes);
    $('nLinks').textContent = fmt(s.links);
    $('nPeople').textContent = fmt(s.people);
    $('nDom').textContent = fmt(D.doms.length);
    $('nComp').textContent = fmt(s.comps);
  });
  // a settle message must not stomp on 'found X' while a hit is on screen
  world.onSettle(n => { if (!world.hit && !world.hits) say('Settled · ' + fmt(n) + ' nodes'); });

  addEventListener('resize', () => world.graph.width(innerWidth).height(innerHeight));

  /* ---- the "i" behind which the edges caveat lives ---- */
  const noteBtn = $('noteBtn');
  const note = $('note');
  if (noteBtn && note) {
    const setNote = open => { note.hidden = !open; noteBtn.setAttribute('aria-expanded', String(open)); };
    noteBtn.addEventListener('click', e => { e.stopPropagation(); setNote(note.hidden); });
    document.addEventListener('click', e => { if (!note.hidden && !e.target.closest('#noteWrap')) setNote(false); });
    addEventListener('keydown', e => { if (e.key === 'Escape' && !note.hidden) setNote(false); });
  }

  return { say, land, clearHit, showEveryone, setHooks: h => Object.assign(hooks, h) };
}

function row(color, label, count, di) {
  const tag = di == null ? 'div' : 'button';
  const attr = di == null ? '' : ` type="button" data-di="${di}" title="Isolate ${esc(label)}"`;
  return `<${tag} class="lgi"${attr}><span class="dot" style="background:${color}"></span>` +
    `<span class="lgi-label">${esc(label)}</span><span class="lgn">${fmt(count)}</span></${tag}>`;
}

function tipHtml(n, D) {
  if (n.t === 'root') {
    return '<span class="tn">' + esc(n.name) + '</span>' +
      '<span class="tr">Everyone here follows this account</span>';
  }
  if (n.t === 'dom') {
    return `<span class="tn">${esc(n.name)}</span>` +
      `<span class="tr">${fmt(n.count)} people</span><span class="tm">Domain</span>`;
  }
  if (n.t === 'comp') {
    return `<span class="tn">${esc(n.name)}</span>` +
      `<span class="tr">${fmt(n.count)} people name it</span><span class="tm">Employer</span>`;
  }
  const company = n.ci >= 0 ? D.comps[n.ci] : (n.freeComp || '');
  return `<span class="tn">${esc(n.name)}</span>` +
    (n.role ? `<span class="tr">${esc(n.role)}</span>` : '') +
    (company ? `<span class="tr">${esc(company)}</span>` : '') +
    `<span class="tm">${esc(D.sen[n.si])} · ${esc(D.doms[n.di])}</span>`;
}

let statusTimer = null;
/** One line at the bottom of the scene. `hold` is for messages that need reading, not glancing. */
function say(text, hold = 2600) {
  const el = $('status');
  el.textContent = text;
  el.classList.remove('gone');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => el.classList.add('gone'), hold);
}
