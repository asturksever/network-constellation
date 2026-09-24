// What the network is, stated once, at the top of the control panel.
//
// Everything here comes from D and people; nothing is computed that the graph
// does not already know. The "In view" panel on the right stays the live,
// filter-aware counter; this is the whole network.

import { $, esc, fmt } from './dom.js';
import { SEN_ORDER } from './taxonomy.js';

const monthYear = t => new Date(t).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

/**
 * The numbers the overview shows, apart from the drawing: totals, the three
 * largest stated seniority bands, the three largest placed fields with their
 * share, and the span of connection dates when the export carried them.
 */
export function overviewNumbers(D, people) {
  const total = D.total || people.length;
  const pct = total ? Math.round(((D.namedCompany || 0) / total) * 100) : 0;
  const topBands = SEN_ORDER
    .map((s, i) => ({ s, i, n: D.senCounts[i] || 0 }))
    .filter(b => b.n && b.s !== 'Unstated')
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);
  const topFields = D.doms
    .map((d, i) => ({ d, i, n: D.domCounts[i], share: total ? Math.round((D.domCounts[i] / total) * 100) : 0 }))
    .filter(x => x.d !== 'Other' && x.d !== 'No headline')
    .slice(0, 3);
  let span = '';
  const dates = people.map(p => p.connectedOn).filter(Boolean);
  if (dates.length > 1) {
    let lo = Infinity, hi = -Infinity;
    for (const t of dates) { if (t < lo) lo = t; if (t > hi) hi = t; }
    span = `${monthYear(lo)} – ${monthYear(hi)}`;
  }
  return { total, pct, topBands, topFields, span };
}

export function renderOverview({ D, people, world }) {
  const el = $('overview');
  if (!el) return;

  const { total, pct, topBands, topFields, span } = overviewNumbers(D, people);

  // seniority as one stacked bar, ordered senior -> unstated
  const senTotal = D.senCounts.reduce((a, b) => a + b, 0) || 1;
  const bar = SEN_ORDER.map((s, i) => {
    const n = D.senCounts[i] || 0;
    if (!n) return '';
    const w = (n / senTotal) * 100;
    return `<span class="ov-seg" style="width:${w.toFixed(2)}%;background:${world.senColor[i]}" ` +
      `title="${esc(s)} · ${fmt(n)}"></span>`;
  }).join('');
  const topMax = topFields.length ? topFields[0].n : 1;

  el.innerHTML =
    `<div class="ov-stats">` +
      `<div class="ov-stat"><span class="ov-n">${fmt(total)}</span><span class="ov-k">people</span></div>` +
      `<div class="ov-stat"><span class="ov-n">${pct}%</span><span class="ov-k">with an employer</span></div>` +
      `<div class="ov-stat"><span class="ov-n">${fmt(D.comps.length)}</span><span class="ov-k">employer hubs</span></div>` +
    `</div>` +
    `<div class="ov-bar" role="img" aria-label="Seniority mix">${bar}</div>` +
    `<div class="ov-bands">` +
      topBands.map(b =>
        `<span class="ov-band"><span class="dot" style="background:${world.senColor[b.i]}"></span>` +
        `${esc(b.s)} <span class="ov-dim">${fmt(b.n)}</span></span>`).join('') +
    `</div>` +
    // A ranked list: colour, name, count and share, with a bar scaled to the
    // largest field so the three compare at a glance. A row isolates its field.
    (topFields.length
      ? `<div class="ov-fields"><span class="ov-k">Top fields</span>` +
        topFields.map((x, rank) => {
          const share = x.share;
          const colour = world.domColor[x.i];
          return `<button type="button" class="ov-frow" data-di="${x.i}" title="Show only ${esc(x.d)}">` +
            `<span class="ov-rank">${rank + 1}</span>` +
            `<span class="dot" style="background:${colour}"></span>` +
            `<span class="ov-fname">${esc(x.d)}</span>` +
            `<span class="ov-fn">${fmt(x.n)}<span class="ov-dim"> · ${share}%</span></span>` +
            `<span class="ov-fbar"><span style="width:${((x.n / topMax) * 100).toFixed(1)}%;background:${colour}"></span></span>` +
            `</button>`;
        }).join('') +
        `</div>`
      : '') +
    (span ? `<div class="ov-line"><span class="ov-k">Connected</span><span class="ov-field">${esc(span)}</span></div>` : '');

  // Clicking a field row isolates it through the same select the panel uses,
  // so the legend and the dropdown stay in step; clicking it again clears it.
  const sel = $('domSel');
  for (const row of el.querySelectorAll('.ov-frow')) {
    row.addEventListener('click', () => {
      if (!sel) return;
      sel.value = sel.value === row.dataset.di ? '-1' : row.dataset.di;
      sel.dispatchEvent(new Event('change'));
      markRows();
    });
  }
  const markRows = () => {
    for (const row of el.querySelectorAll('.ov-frow')) row.classList.toggle('on', sel?.value === row.dataset.di);
  };
  sel?.addEventListener('change', markRows);
}
