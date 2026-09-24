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
