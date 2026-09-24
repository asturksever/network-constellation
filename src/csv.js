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

  // Two columns with the same name would collapse into one key and the second
  // would silently win. Number the repeats so the column mapper can reach
  // both, and give a nameless column its position rather than the empty key.
  const seen = new Map();
  const header = rows[0].map((h, i) => {
    const name = h.trim() || `Column ${i + 1}`;
    const n = (seen.get(name) || 0) + 1;
    seen.set(name, n);
    return n === 1 ? name : `${name} (${n})`;
  });
  return rows.slice(1)
    .filter(r => r.length && r.some(v => v !== ''))
    .map(r => {
      const o = {};
      header.forEach((h, i) => { o[h] = (r[i] || '').trim(); });
      return o;
    });
}

/**
 * Bytes off disk -> text, or the reason they are not a CSV at all.
 *
 * Excel on Windows saves "CSV (Comma delimited)" as windows-1252, where every
 * accented letter is a single byte UTF-8 cannot read. Decoded as UTF-8 those
 * letters became U+FFFD and "José Müller" arrived as "Jos� M�ller", silently.
 * So UTF-8 is tried first (it is what LinkedIn exports), and a file that
 * mostly does not survive it is read as windows-1252 instead, with
 * `encoding` saying so.
 *
 * The two wrong files people actually drop are recognised by their bytes: an
 * .xlsx workbook (a zip with xl/ inside), and LinkedIn's whole download (a
 * zip with Connections.csv inside) — both get a specific next step.
 */
export function decodeCsv(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) {
    // zip: file names sit in the local headers and the central directory at the end
    const peek = new TextDecoder('windows-1252').decode(b.subarray(0, 65536)) +
      new TextDecoder('windows-1252').decode(b.subarray(Math.max(0, b.length - 262144)));
    if (peek.includes('xl/workbook')) return { kind: 'xlsx' };
    if (/Connections\.csv/i.test(peek)) return { kind: 'linkedin-zip' };
    return { kind: 'zip' };
  }
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return { kind: 'xls' };
  if (b[0] === 0xff && b[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(b), encoding: 'utf-16le' };
  if (b[0] === 0xfe && b[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(b), encoding: 'utf-16be' };

  // A UTF-8 byte-order mark settles it. Otherwise a stray bad byte in a real
  // UTF-8 file must not flip the whole file: only when unreadable characters
  // outnumber the accented letters that did decode is it another encoding.
  const utf8 = new TextDecoder('utf-8').decode(b);
  const bom = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf;
  let bad = 0, good = 0;
  if (!bom) {
    for (const ch of utf8) {
      if (ch === '\uFFFD') bad++;
      else if (ch.charCodeAt(0) > 0x7f) good++;
    }
  }
  if (bom || bad <= good) return { text: utf8, encoding: 'utf-8' };
  return { text: new TextDecoder('windows-1252').decode(b), encoding: 'windows-1252' };
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
