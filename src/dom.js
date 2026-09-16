// The three DOM helpers every UI module needs.
//
// They live in their own module for one reason: scripts/bundle.mjs concatenates
// every module into a single scope, so a second `const $` declared anywhere
// would be a SyntaxError in the bundled build. Import from here, never redeclare.

export const fmt = n => n.toLocaleString('en-GB');

export const esc = s =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const $ = id => document.getElementById(id);
