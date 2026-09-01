// Control panel, tooltip and status line. Everything here talks to the world
// object returned by createConstellation and knows nothing about three.js.

const fmt = n => n.toLocaleString('en-GB');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const $ = id => document.getElementById(id);

export function wireUI(world, D) {
  /* ---- tooltip ---- */
  const tip = $('tip');
  const scene = $('scene');

  world.graph.onNodeHover(n => {
    scene.style.cursor = n && n.t === 'p' && n.slug ? 'pointer' : 'default';
    if (!n) { tip.classList.remove('on'); return; }
    tip.innerHTML = describe(n, D);
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
    if (n.t === 'dom') { $('domSel').value = String(n.di); world.setIsolate(n.di); return; }
    world.flyTo(n, n.t === 'comp' ? 130 : 90);
  });

  /* ---- density ---- */
  const segButtons = [...document.querySelectorAll('.seg button')];
  segButtons.forEach(b => b.addEventListener('click', () => {
    segButtons.forEach(o => o.setAttribute('aria-pressed', String(o === b)));
    world.setDensity(b.dataset.d);
    say('Settling...');
  }));

  /* ---- isolate ---- */
  const sel = $('domSel');
  D.doms.forEach((name, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = `${name}  (${fmt(D.domCounts[i])})`;
    sel.appendChild(o);
  });
  sel.addEventListener('change', () => world.setIsolate(parseInt(sel.value, 10)));

  /* ---- employer links ---- */
  $('compToggle').addEventListener('change', e => {
    world.setShowComp(e.target.checked);
    say('Settling...');
  });

  /* ---- search ---- */
  const search = $('search');
  let timer = null;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const hit = world.findPerson(search.value);
      if (!hit || hit.x === undefined) return;
      if (!world.isVisible(hit)) {
        segButtons.forEach(o => o.setAttribute('aria-pressed', String(o.dataset.d === 'all')));
        world.setDensity('all');
        setTimeout(() => world.flyTo(hit), 400);
      } else {
        world.flyTo(hit);
      }
      say('Found ' + hit.name);
    }, 260);
  });

  /* ---- legend ---- */
  const legend = $('legend');
  const { PALETTE } = world;
  world.top3.forEach((di, k) => {
    legend.insertAdjacentHTML('beforeend', row(world.series[k], D.doms[di], D.domCounts[di]));
  });
  const tailCount = D.total - world.top3.reduce((a, di) => a + D.domCounts[di], 0);
  legend.insertAdjacentHTML('beforeend',
    row(world.personColor, `The other ${D.doms.length - 3} domains`, tailCount) +
    row(world.compColor, 'Employer hub', D.comps.length));

  /* ---- stats + status ---- */
  world.onStats(s => {
    $('nNodes').textContent = fmt(s.nodes);
    $('nLinks').textContent = fmt(s.links);
    $('nPeople').textContent = fmt(s.people);
    $('nDom').textContent = fmt(D.doms.length);
    $('nComp').textContent = fmt(s.comps);
  });
  world.onSettle(n => say('Settled - ' + fmt(n) + ' nodes'));

  addEventListener('resize', () => world.graph.width(innerWidth).height(innerHeight));

  return { say };
}

function row(color, label, count) {
  return `<div class="lgi"><span class="dot" style="background:${color}"></span>` +
    `${esc(label)}<span class="lgn">${fmt(count)}</span></div>`;
}

function describe(n, D) {
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
