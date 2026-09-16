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

  world.graph.onNodeClick(n => {
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
  function land(n, ctx) {
    const index = ctx?.index ?? at;
    const total = ctx?.total ?? matches.length;
    world.setHit(n);
    if (!world.isVisible(n)) {
      // the person is filtered out of the scene — put them back before flying
      segButtons.forEach(o => o.setAttribute('aria-pressed', String(o.dataset.d === 'all')));
      world.setDensity('all');
      setTimeout(() => { if (world.hit === n) { world.swoopTo(n); hit.show(n); } }, 420);
    } else {
      world.swoopTo(n);
      hit.show(n);
    }
    say(n.name + (total > 1
      ? `  ·  ${index + 1} of ${total}, Enter for next`
      : '  ·  found'));
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
      land(matches[0]);
    }, 240);
  });

  search.addEventListener('keydown', e => {
    if (e.key === 'Enter' && matches.length > 1) {
      e.preventDefault();
      at = (at + (e.shiftKey ? matches.length - 1 : 1)) % matches.length;
      land(matches[at]);
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
  world.onSettle(n => { if (!world.hit) say('Settled - ' + fmt(n) + ' nodes'); });

  addEventListener('resize', () => world.graph.width(innerWidth).height(innerHeight));

  return { say, land, clearHit };
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
function say(text) {
  const el = $('status');
  el.textContent = text;
  el.classList.remove('gone');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => el.classList.add('gone'), 2600);
}
