// The scene: turns the compact data file into nodes and links, owns the
// force-graph instance, and exposes the handful of things the UI can change.
//
// Node kinds
//   root  a single node for the account everyone follows
//   dom   one per domain, the gravity well its people fall into
//   comp  one per employer named by MIN_COMPANY_SIZE+ people
//   p     one per person
//
// Links are person->domain and person->employer. They are memberships, NOT
// relationships between people: LinkedIn does not expose who follows whom.

import { GROUND, domainHues, seniorityRamp, fade, mix } from './palette.js';

export const PALETTE = {
  root: '#f2f6fa',
  // employer hubs stay achromatic-warm so node KIND never reads as a domain hue
  compHub: '#cbb89a',
  compLink: 'rgba(226, 208, 178, 0.16)',
  // the two buckets that mean "we could not place this person" stay grey on purpose
  unplaced: '#5d6772',
  ghost: '#212830',
  isolate: '#4d9bff',
  spine: 'rgba(238,242,245,0.035)',
  // The search hit. The scene is full of warm employer hubs, so the hit goes
  // white-hot instead — the one value nothing else here reaches — and the gold
  // belongs to the marker drawn around it.
  hit: '#ffffff',
  hitLink: 'rgba(255, 209, 102, 0.9)'
};

const UNPLACED_DOMAINS = new Set(['Other', 'No headline']);

export function createConstellation(el, D, opts = {}) {
  const ROOT_ID = 0;
  const DOM0 = 1;
  const COMP0 = DOM0 + D.doms.length;
  const PPL0 = COMP0 + D.comps.length;

  // Every placeable domain gets its own hue, assigned largest-first so the
  // biggest lobes land furthest apart on the wheel. 'Other' and 'No headline'
  // stay grey — that greyness is information, not a leftover.
  const placeable = D.doms.map((n, i) => i).filter(i => !UNPLACED_DOMAINS.has(D.doms[i]));
  const hues = domainHues(placeable.length);
  const domColor = D.doms.map(() => PALETTE.unplaced);
  placeable.forEach((di, k) => { domColor[di] = hues[k]; });

  const senColor = seniorityRamp();
  // hubs read as a brighter core of their own cluster
  const hubColor = domColor.map(c => mix(c, '#ffffff', 0.34));

  const allNodes = [];
  const allLinks = [];

  allNodes.push({ id: ROOT_ID, t: 'root', name: opts.rootLabel || 'You', val: 148, col: PALETTE.root });

  D.doms.forEach((name, i) => {
    allNodes.push({
      id: DOM0 + i, t: 'dom', di: i, name, count: D.domCounts[i],
      val: 18 + D.domCounts[i] / 33
    });
    allLinks.push({ source: DOM0 + i, target: ROOT_ID, k: 'spine' });
  });

  D.comps.forEach((name, i) => {
    allNodes.push({
      id: COMP0 + i, t: 'comp', name, count: D.compCounts[i],
      val: 1.6 + D.compCounts[i] / 12
    });
  });

  D.people.forEach((p, i) => {
    const id = PPL0 + i;
    allNodes.push({
      id, t: 'p', name: p[0], role: p[1], ci: p[2], di: p[3], si: p[4],
      slug: p[5], freeComp: p[6], val: 0.55
    });
    allLinks.push({ source: id, target: DOM0 + p[3], k: 'dom' });
    if (p[2] >= 0) allLinks.push({ source: id, target: COMP0 + p[2], k: 'comp' });
  });

  const state = { density: 'all', isolate: -1, showComp: true, colorBy: 'domain' };

  // the current search hit, if any — drawn hot and fat so it cannot be missed
  let hitNode = null;
  const HIT_VAL = 8;      // ~2.5x a person's radius — spotted, not a wall

  // Every match of the current question, lit together; everyone else drops to
  // the isolate ghost, so an answer reads as a constellation within the
  // constellation. Holds node objects, which is what the accessors receive.
  let hitSet = null;
  const SET_VAL = 2.2;

  const isVisible = n => {
    if (n.t !== 'p') return true;
    if (state.density === 'hubs') return false;
    if (state.density === 'senior' && n.si > 1) return false;
    return true;
  };

  function build() {
    const keep = new Set();
    let nodes = [];
    for (const n of allNodes) if (isVisible(n)) { keep.add(n.id); nodes.push(n); }

    const idOf = v => (typeof v === 'object' ? v.id : v);
    const links = allLinks.filter(l => {
      if (l.k === 'comp' && !state.showComp) return false;
      return keep.has(idOf(l.source)) && keep.has(idOf(l.target));
    });

    // an employer hub with nobody left attached is just a floating dot
    if (state.density !== 'all' || !state.showComp) {
      const used = new Set();
      for (const l of links) {
        const t = idOf(l.target);
        if (t >= COMP0 && t < PPL0) used.add(t);
      }
      nodes = nodes.filter(n => n.t !== 'comp' || used.has(n.id));
    }
    return { nodes, links };
  }

  function baseColor(n) {
    if (n.t === 'root') return PALETTE.root;
    if (n.t === 'comp') return PALETTE.compHub;
    if (state.colorBy === 'seniority') {
      if (n.t === 'dom') return mix(PALETTE.unplaced, '#ffffff', 0.3);
      return senColor[n.si];
    }
    return n.t === 'dom' ? hubColor[n.di] : domColor[n.di];
  }

  const nodeColor = n => {
    if (n === hitNode) return PALETTE.hit;
    if (hitSet) {
      if (hitSet.has(n)) return mix(baseColor(n), '#ffffff', 0.55);
      return n.t === 'root' ? PALETTE.root : PALETTE.ghost;
    }
    if (state.isolate < 0) return baseColor(n);
    if (n.t === 'root') return PALETTE.root;
    if (n.di === state.isolate) {
      return n.t === 'dom' ? mix(domColor[n.di], '#ffffff', 0.45) : domColor[n.di];
    }
    return PALETTE.ghost;
  };

  const nodeVal = n => (n === hitNode ? HIT_VAL : hitSet && hitSet.has(n) ? SET_VAL : n.val);

  // Tinting each spoke with its own cluster's hue is what turns the scene from
  // a grey web with coloured dots into something that reads as coloured light.
  const domLink = domColor.map(c => fade(c, 0.13));
  const isoLink = domColor.map(c => fade(c, 0.34));
  const setLink = domColor.map(c => fade(c, 0.45));

  const linkColor = l => {
    // the hit's two spokes trace it back to its domain and its employer
    if (hitNode && (l.source === hitNode || l.target === hitNode)) return PALETTE.hitLink;
    const di = l.source?.di ?? l.target?.di;
    if (hitSet) {
      if (hitSet.has(l.source) || hitSet.has(l.target)) return di == null ? PALETTE.hitLink : setLink[di];
      return 'rgba(238,242,245,0.018)';
    }
    if (state.isolate >= 0) {
      return di === state.isolate ? isoLink[di] : 'rgba(238,242,245,0.018)';
    }
    if (l.k === 'spine') return PALETTE.spine;
    if (l.k === 'comp') return PALETTE.compLink;
    if (state.colorBy === 'seniority') return fade(senColor[l.source?.si ?? 6], 0.11);
    return di == null ? PALETTE.spine : domLink[di];
  };

  const G = ForceGraph3D()(el)
    .backgroundColor(GROUND)
    .showNavInfo(false)
    .nodeRelSize(3.4)
    .nodeResolution(6)
    .nodeVal(nodeVal)
    .nodeColor(nodeColor)
    .nodeOpacity(0.92)
    .nodeLabel(() => '')
    .linkColor(linkColor)
    .linkWidth(0)
    .linkOpacity(1)
    .enableNodeDrag(false)
    .cooldownTicks(170)
    .warmupTicks(opts.warmupTicks ?? 8);

  G.d3Force('charge').strength(-38).distanceMax(340);
  G.d3Force('link').distance(l => (l.k === 'spine' ? 130 : l.k === 'comp' ? 34 : 22));

  const repaint = () => { G.nodeColor(nodeColor).nodeVal(nodeVal).linkColor(linkColor); };

  /** Pull the camera back until the whole graph is in frame. */
  function frameGraph(ms = 900) {
    const rs = G.graphData().nodes
      .filter(n => n.x !== undefined)
      .map(n => Math.hypot(n.x, n.y, n.z))
      .sort((a, b) => a - b);
    if (!rs.length) return;
    const r = rs[Math.floor(rs.length * 0.93)] || rs[rs.length - 1];
    G.cameraPosition({ x: 0, y: 0, z: Math.max(260, r * 2.15) }, { x: 0, y: 0, z: 0 }, ms);
  }

  /**
   * Frame an arbitrary set of nodes — the lit results of a question — by their
   * own spread, the same way a cluster is framed: 90th-percentile radius from
   * the centroid, camera pulled back along the centroid's own direction so it
   * never lands inside the set.
   */
  function frameNodes(list, ms = 900) {
    const pts = list.filter(n => n.x !== undefined);
    if (!pts.length) return;
    const c = pts.reduce((a, n) => ({ x: a.x + n.x, y: a.y + n.y, z: a.z + n.z }), { x: 0, y: 0, z: 0 });
    c.x /= pts.length; c.y /= pts.length; c.z /= pts.length;
    const ds = pts.map(n => Math.hypot(n.x - c.x, n.y - c.y, n.z - c.z)).sort((a, b) => a - b);
    const dist = Math.max(230, (ds[Math.floor(ds.length * 0.9)] || 90) * 2.8);
    const r = Math.hypot(c.x, c.y, c.z);
    const dir = r > 1 ? { x: c.x / r, y: c.y / r, z: c.z / r } : { x: 0, y: 0, z: 1 };
    wantFrame = false;
    G.cameraPosition({ x: c.x + dir.x * dist, y: c.y + dir.y * dist, z: c.z + dir.z * dist }, c, ms);
  }

  /** Frame one domain by its own spread, so the camera never lands inside it. */
  function frameCluster(di) {
    const pts = allNodes.filter(n =>
      n.di === di && n.x !== undefined && (n.t !== 'p' || isVisible(n)));
    if (!pts.length) return;
    const c = pts.reduce((a, n) => ({ x: a.x + n.x, y: a.y + n.y, z: a.z + n.z }), { x: 0, y: 0, z: 0 });
    c.x /= pts.length; c.y /= pts.length; c.z /= pts.length;
    const ds = pts.map(n => Math.hypot(n.x - c.x, n.y - c.y, n.z - c.z)).sort((a, b) => a - b);
    const dist = Math.max(230, (ds[Math.floor(ds.length * 0.9)] || 90) * 2.8);
    const r = Math.hypot(c.x, c.y, c.z) || 1;
    G.cameraPosition(
      { x: c.x + c.x / r * dist, y: c.y + c.y / r * dist, z: c.z + c.z / r * dist }, c, 950);
  }

  function flyTo(n, dist = 90, ms = 900) {
    const r = Math.hypot(n.x, n.y, n.z) || 1;
    G.cameraPosition(
      { x: n.x * (1 + dist / r), y: n.y * (1 + dist / r), z: n.z * (1 + dist / r) }, n, ms);
  }

  /**
   * A swoop rather than a straight cut: pull out to a wide shot on the target
   * first, then close in. The two moves together read as "there it is", where a
   * single jump just teleports you somewhere that looks like everywhere else.
   */
  function swoopTo(n, dist = 150) {
    flyTo(n, Math.max(dist * 3.6, 520), 520);
    setTimeout(() => { if (n === hitNode) flyTo(n, dist, 780); }, 540);
  }

  let wantFrame = true;
  let onStats = () => {};
  let lastStats = null;

  /**
   * A slow turn about the vertical axis, for the landing page. About one
   * revolution in a hundred seconds: enough to feel alive, too slow to
   * pull the eye off the text in front of it. Each frame starts from wherever
   * the camera is, so a framing move that lands mid-turn is simply carried on.
   */
  let orbitRaf = 0;
  function orbit(on) {
    cancelAnimationFrame(orbitRaf);
    orbitRaf = 0;
    if (!on || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    wantFrame = false;          // the settle must not tween against the turn
    let last = performance.now();
    const tick = t => {
      const a = Math.min(64, t - last) * 0.000063;
      last = t;
      const { x, y, z } = G.camera().position;
      G.cameraPosition({ x: x * Math.cos(a) - z * Math.sin(a), y, z: x * Math.sin(a) + z * Math.cos(a) });
      orbitRaf = requestAnimationFrame(tick);
    };
    orbitRaf = requestAnimationFrame(tick);
  }

  /** Stop drawing and give the WebGL context back, so another world can take the element. */
  function dispose() {
    orbit(false);
    G.pauseAnimation();
    G.graphData({ nodes: [], links: [] });
    const r = G.renderer();
    r.dispose();
    r.forceContextLoss?.();
    el.innerHTML = '';
  }

  function apply() {
    const g = build();
    G.graphData(g);
    wantFrame = true;
    lastStats = {
      nodes: g.nodes.length,
      links: g.links.length,
      people: g.nodes.filter(n => n.t === 'p').length,
      comps: g.nodes.filter(n => n.t === 'comp').length
    };
    onStats(lastStats);
  }

  return {
    graph: G,
    nodes: allNodes,
    DOM0, COMP0, PPL0,
    domColor,
    hubColor,
    senColor,
    placeable,
    state,
    apply,
    repaint,
    frameGraph,
    frameCluster,
    frameNodes,
    flyTo,
    swoopTo,
    orbit,
    dispose,
    isVisible,
    // a listener that arrives after the layout (the demo, wired onto the
    // world already turning behind the landing) still hears the counts
    onStats(fn) { onStats = fn; if (lastStats) fn(lastStats); },
    onSettle(fn) {
      G.onEngineStop(() => {
        // never yank the camera off a search hit to re-frame the whole graph
        if (wantFrame && !hitNode && !hitSet) { wantFrame = false; frameGraph(900); }
        fn(G.graphData().nodes.length);
      });
    },
    setDensity(d) { state.density = d; apply(); },
    setShowComp(v) { state.showComp = v; apply(); },
    setColorBy(mode) { state.colorBy = mode; repaint(); },
    get hit() { return hitNode; },
    setHit(n) { hitNode = n || null; if (hitNode) wantFrame = false; repaint(); },
    get hits() { return hitSet; },
    /** Light a set of nodes and dim the rest. Colour re-bind only; the layout is untouched. */
    setHits(nodes) {
      hitSet = nodes && nodes.size ? nodes : null;
      if (hitSet) wantFrame = false;
      repaint();
    },
    setIsolate(di) {
      state.isolate = di;
      repaint();
      if (di >= 0) frameCluster(di); else frameGraph(800);
    },
    /**
     * Every match, best first: whole-name prefix, then any-word prefix, then
     * anywhere in the name. Ties break on the shorter name, so "Ada Lovelace"
     * outranks "Adalberto Lovelace-Mendoza" for the query "ada".
     */
    findPeople(q, limit = 40) {
      const s = q.trim().toLowerCase();
      if (s.length < 2) return [];
      const out = [];
      for (const n of allNodes) {
        if (n.t !== 'p') continue;
        const name = n.name.toLowerCase();
        let rank = -1;
        if (name.startsWith(s)) rank = 0;
        else if (name.split(/\s+/).some(w => w.startsWith(s))) rank = 1;
        else if (name.includes(s)) rank = 2;
        if (rank >= 0) out.push({ n, rank });
      }
      out.sort((a, b) => a.rank - b.rank || a.n.name.length - b.n.name.length);
      return out.slice(0, limit).map(o => o.n);
    },
    findPerson(q) { return this.findPeople(q, 1)[0] || null; }
  };
}
