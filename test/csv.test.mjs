import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, decodeCsv } from '../src/csv.js';

const cp1252 = s => Uint8Array.from([...s].map(c => ({ 'é': 0xe9, 'ü': 0xfc, 'ñ': 0xf1 })[c] ?? c.charCodeAt(0)));

test('a windows-1252 CSV (Excel on Windows) keeps its accented letters', () => {
  const got = decodeCsv(cp1252('First Name,Last Name\nJosé,Müller\nIñigo,Peña\n'));
  assert.equal(got.encoding, 'windows-1252');
  assert.deepEqual(parseCSV(got.text)[0], { 'First Name': 'José', 'Last Name': 'Müller' });
});

test('a UTF-8 CSV stays UTF-8, even with a stray bad byte in it', () => {
  const good = new TextEncoder().encode('Name\nJosé Müller\nZoë Ångström\n');
  const withJunk = Uint8Array.from([...good, 0xff, 0x0a]);
  assert.equal(decodeCsv(good).encoding, 'utf-8');
  assert.equal(decodeCsv(withJunk).encoding, 'utf-8');
  // and a byte-order mark settles it outright
  assert.equal(decodeCsv(Uint8Array.from([0xef, 0xbb, 0xbf, 0xff, 0xfe, 0x41])).encoding, 'utf-8');
});

test('the files people drop instead of a CSV are recognised', () => {
  const zip = name => Uint8Array.from([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode(`....${name}....`)]);
  assert.equal(decodeCsv(zip('xl/workbook.xml')).kind, 'xlsx');
  assert.equal(decodeCsv(zip('Connections.csv')).kind, 'linkedin-zip');
  assert.equal(decodeCsv(zip('photos/a.jpg')).kind, 'zip');
  assert.equal(decodeCsv(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0])).kind, 'xls');
});

test('duplicate and empty header names are numbered, not collapsed', () => {
  const [row] = parseCSV('Company,Company,,Name\nAcme,Beta,x,Ada\n');
  assert.deepEqual(row, { Company: 'Acme', 'Company (2)': 'Beta', 'Column 3': 'x', Name: 'Ada' });
});
