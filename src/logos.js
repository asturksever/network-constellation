// Employer logos, drawn as HTML over the canvas and projected from each hub's
// 3D position — the same trick as the domain labels, for the same reasons: no
// extra library, crisp at any zoom, and no second three.js instance in the scene.
//
// Size carries headcount. A logo's world radius scales with the square root of
// the number of people who named that employer, then perspective converts world
// radius to pixels, so a logo shrinks as you fly away from it exactly like the
// geometry around it. Companies below the hub threshold never reach this code:
// build-data.mjs only promotes an employer named by two or more people, so
// there is nothing here to filter out.

const MIN_WORLD_R = 5;    // an employer named by 2 people
const MAX_WORLD_R = 24;   // the largest employer in the set
const MIN_ON_SCREEN = 11; // below this a logo is illegible noise — drop it
const MAX_ON_SCREEN = 190;

export function createLogos(container, world, D, sources) {
  const counts = D.compCounts;
  const lo = Math.min(...counts);
  const hi = Math.max(...counts);
  const span = Math.max(1, hi - lo);

  const items = D.comps
    .map((name, i) => ({ name, count: counts[i], node: world.nodes[world.COMP0 + i], src: sources[name] }))
    .filter(e => e.src)
    .sort((a, b) => b.count - a.count)
    .map(e => {
      const el = document.createElement('div');
      el.className = 'complogo';
      const img = document.createElement('img');
      img.src = e.src;
      img.alt = e.name;
      img.loading = 'lazy';
      // a logo that 404s or decodes to nothing must not leave an empty chip
      img.addEventListener('error', () => { e.dead = true; el.remove(); });
      el.appendChild(img);
      container.appendChild(el);
      // sqrt keeps the biggest employer from dwarfing everything else
      e.worldR = MIN_WORLD_R + (MAX_WORLD_R - MIN_WORLD_R) * Math.sqrt((e.count - lo) / span);
      e.el = el;
      return e;
    });

  let enabled = true;

  function frame() {
    if (!enabled) { requestAnimationFrame(frame); return; }
    const G = world.graph;
    const cam = G.camera();
    const ctr = G.controls().target;
    const fx = ctr.x - cam.position.x, fy = ctr.y - cam.position.y, fz = ctr.z - cam.position.z;
    // world units -> pixels, at one unit of depth
    const k = (innerHeight / 2) / Math.tan((cam.fov * Math.PI / 180) / 2);
    const placed = [];

    for (const e of items) {
      const n = e.node, el = e.el;
      if (e.dead || !n || n.x === undefined || world.state.isolate >= 0) { hide(el); continue; }

      const vx = n.x - cam.position.x, vy = n.y - cam.position.y, vz = n.z - cam.position.z;
      if (vx * fx + vy * fy + vz * fz <= 0) { hide(el); continue; }   // behind camera

      const dist = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const px = (e.worldR / dist) * k * 2;
      if (px < MIN_ON_SCREEN) { hide(el); continue; }

      const c = G.graph2ScreenCoords(n.x, n.y, n.z);
      if (!c || c.x < -px || c.y < -px || c.x > innerWidth + px || c.y > innerHeight + px) {
        hide(el); continue;
      }

      const size = Math.min(px, MAX_ON_SCREEN);
      const half = size / 2;
      const box = { l: c.x - half, r: c.x + half, t: c.y - half, b: c.y + half };
      // bigger employers were sorted first, so they win any overlap
      if (placed.some(q => box.l < q.r && box.r > q.l && box.t < q.b && box.b > q.t)) {
        hide(el); continue;
      }
      placed.push(box);

      el.style.width = size + 'px';
      el.style.height = size + 'px';
      el.style.left = c.x + 'px';
      el.style.top = c.y + 'px';
      el.classList.add('on');
    }
    requestAnimationFrame(frame);
  }

  const hide = el => el.classList.remove('on');
  requestAnimationFrame(frame);

  return {
    count: items.length,
    setEnabled(v) {
      enabled = v;
      if (!v) items.forEach(e => hide(e.el));
    }
  };
}
