// The three DOM helpers every UI module needs.
//
// They live in their own module for one reason: scripts/bundle.mjs concatenates
// every module into a single scope, so a second `const $` declared anywhere
// would be a SyntaxError in the bundled build. Import from here, never redeclare.

export const fmt = n => n.toLocaleString('en-GB');

// Safe in text and inside a quoted attribute alike: CSV headers, names and
// headlines all end up in value="..." or title="..." somewhere.
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ENTITIES[c]);

export const $ = id => document.getElementById(id);

/**
 * Where the open scene ends on the right: the left edge of a side panel if
 * one is showing, the window's edge otherwise. The hit card and the tooltip
 * flip against this, so neither draws over the panel you are reading.
 */
export function sceneRight() {
  for (const id of ['detail', 'answer']) {
    const el = $(id);
    if (el && !el.hidden && el.getClientRects().length) {   // displayed (offsetParent is null for fixed)
      const r = el.getBoundingClientRect();
      if (r.top < innerHeight / 2) return r.left;   // a side column, not a bottom sheet
    }
  }
  return innerWidth;
}
