// The "found you" marker.
//
// A search hit is one 0.55-unit dot among ten thousand. Flying the camera at it
// is not enough — you arrive and still cannot tell which speck you came for. So
// the hit gets an overlay locked to its projected screen position: a sonar ping,
// a rotating reticle, and a card naming the person. Same projection trick as the
// domain labels, for the same reasons.
//
// The dot itself is brightened by graph.js (setHit); this module only draws the
// furniture around it.

import { sceneRight } from './dom.js';

export function createHighlight(container, world, D) {
  const el = document.createElement('div');
  el.className = 'nchit';
  el.innerHTML =
    '<span class="ring"></span><span class="ring"></span><span class="ring"></span>' +
    '<span class="retic"></span><span class="core"></span>' +
    '<span class="stem"></span>' +
    '<div class="card">' +
      '<span class="hn"></span><span class="hr"></span><span class="hc"></span>' +
      '<span class="hm"></span><span class="hgo"></span>' +
    '</div>';
  container.appendChild(el);

  const card = el.querySelector('.card');
  const q = s => el.querySelector(s);
  let node = null;

  card.addEventListener('click', () => {
    if (node && node.slug) {
      window.open('https://www.linkedin.com/in/' + node.slug + '/', '_blank', 'noopener');
    }
  });

  function show(n) {
    node = n;
    const company = n.ci >= 0 ? D.comps[n.ci] : (n.freeComp || '');
    q('.hn').textContent = n.name;
    q('.hr').textContent = n.role || '';
    q('.hc').textContent = company;
    q('.hm').textContent = D.sen[n.si] + ' · ' + D.doms[n.di];
    q('.hgo').textContent = n.slug ? 'Open profile ↗' : '';
    card.style.cursor = n.slug ? 'pointer' : 'default';

    // restart the burst animations from zero on every new hit
    el.classList.remove('burst');
    void el.offsetWidth;
    el.classList.add('burst', 'on');
  }

  function clear() {
    node = null;
    el.classList.remove('on', 'burst');
  }

  function frame() {
    if (node) {
      const G = world.graph;
      const cam = G.camera();
      const ctr = G.controls().target;
      const vx = node.x - cam.position.x;
      const vy = node.y - cam.position.y;
      const vz = node.z - cam.position.z;
      const behind =
        vx * (ctr.x - cam.position.x) +
        vy * (ctr.y - cam.position.y) +
        vz * (ctr.z - cam.position.z) <= 0;

      if (node.x === undefined || behind) {
        el.classList.remove('vis');
      } else {
        const c = G.graph2ScreenCoords(node.x, node.y, node.z);
        if (!c) {
          el.classList.remove('vis');
        } else {
          el.style.left = c.x + 'px';
          el.style.top = c.y + 'px';
          // keep the card in the open scene: swing it left of the marker near
          // the window's edge, or near a side panel's
          el.classList.toggle('flip', c.x > sceneRight() - 380);
          el.classList.add('vis');
        }
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { show, clear, get node() { return node; } };
}
