// Domain names drawn as HTML over the canvas, projected from their hub's 3D
// position every frame. HTML rather than sprites so the text stays crisp and
// needs no extra library.
//
// Bigger domains get first claim on screen space; any label that would collide
// with one already placed is dropped for that frame. Without this the middle of
// the graph turns into a pile of overlapping words.

export function createLabels(container, world, D) {
  const els = D.doms.map(name => {
    const el = document.createElement('div');
    el.className = 'hublab';
    el.textContent = name;
    container.appendChild(el);
    return el;
  });

  const order = D.doms
    .map((_, i) => i)
    .sort((a, b) => D.domCounts[b] - D.domCounts[a]);

  function frame() {
    const G = world.graph;
    const cam = G.camera();
    const ctr = G.controls().target;
    const fx = ctr.x - cam.position.x;
    const fy = ctr.y - cam.position.y;
    const fz = ctr.z - cam.position.z;
    const placed = [];

    for (const i of order) {
      const node = world.nodes[world.DOM0 + i];
      const el = els[i];
      if (node.x === undefined || (world.state.isolate >= 0 && world.state.isolate !== i)) {
        el.classList.remove('on');
        continue;
      }
      // behind the camera projects to a mirrored position — skip it
      const vx = node.x - cam.position.x;
      const vy = node.y - cam.position.y;
      const vz = node.z - cam.position.z;
      if (vx * fx + vy * fy + vz * fz <= 0) { el.classList.remove('on'); continue; }

      const c = G.graph2ScreenCoords(node.x, node.y, node.z);
      if (!c || c.x < 0 || c.y < 0 || c.x > innerWidth || c.y > innerHeight) {
        el.classList.remove('on');
        continue;
      }

      const w = el.offsetWidth, h = el.offsetHeight, y = c.y - 14;
      const box = { l: c.x - w / 2 - 7, r: c.x + w / 2 + 7, t: y - h / 2 - 4, b: y + h / 2 + 4 };
      if (placed.some(q => box.l < q.r && box.r > q.l && box.t < q.b && box.b > q.t)) {
        el.classList.remove('on');
        continue;
      }

      placed.push(box);
      el.style.left = c.x + 'px';
      el.style.top = y + 'px';
      el.classList.add('on');
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
