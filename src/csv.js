// A CSV reader small enough to read in one sitting. Handles quoted fields,
// embedded commas and newlines, and doubled quotes. No dependencies, and the
// same code serves the Node build and a browser file drop.

export function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const rows = [];
  let row = [], field = '', inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];

  const header = rows[0].map(h => h.trim());
  return rows.slice(1)
    .filter(r => r.length && r.some(v => v !== ''))
    .map(r => {
      const o = {};
      header.forEach((h, i) => { o[h] = (r[i] || '').trim(); });
      return o;
    });
}

/** Find a column by any of several likely names — pulls differ in wording. */
export function pickColumn(row, candidates) {
  const keys = Object.keys(row);
  for (const want of candidates) {
    const hit = keys.find(k => k.toLowerCase() === want.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

export function toCSV(header, rows) {
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  return '﻿' + header.map(q).join(',') + '\r\n' +
    rows.map(r => r.map(q).join(',')).join('\r\n');
}
