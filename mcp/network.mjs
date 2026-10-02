// What the MCP server knows about your network, as plain functions.
//
// The same pipeline as the web page: decodeCsv -> parseCSV -> buildGraph, then
// ask.js for questions. Nothing here talks to the network. What leaves the
// machine is whatever these functions return, because the AI tool you ask puts
// it into the conversation — so they return names, roles, employers and fields,
// never an email address, and a profile link only if you turn links on.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeCsv, parseCSV } from '../src/csv.js';
import { deNote, buildGraph } from '../src/build.js';
import { resolveQuery, runQuery, describe, buildIdf } from '../src/ask.js';
import { SEN_ORDER } from '../src/taxonomy.js';

/** Raised for anything the person at the keyboard can fix; the message says how. */
export class NetworkError extends Error {}

/**
 * Read and classify an export. Accepts LinkedIn's Connections.csv or any CSV
 * the web page accepts, in UTF-8 or Excel's windows-1252.
 */
export function loadNetwork(csvPath, { includeLinks = false } = {}) {
  if (!csvPath) {
    throw new NetworkError(
      'No export configured. Start the server with --csv /path/to/Connections.csv ' +
      '(or set NC_CSV). Get the file from LinkedIn: Settings → Data privacy → ' +
      'Get a copy of your data → Connections.');
  }
  const path = resolve(csvPath.replace(/^~(?=\/|$)/, process.env.HOME || '~'));
  if (!existsSync(path)) throw new NetworkError(`No file at ${path}. Check the --csv path in your MCP config.`);

  const decoded = decodeCsv(readFileSync(path));
  if (decoded.kind === 'linkedin-zip') throw new NetworkError(`${path} is LinkedIn's whole download. Unzip it and point --csv at the Connections.csv inside.`);
  if (decoded.kind) throw new NetworkError(`${path} is not a CSV (it looks like ${decoded.kind}). Save or export it as CSV.`);

  let built;
  try {
    built = buildGraph(parseCSV(deNote(decoded.text)));
  } catch (err) {
    throw new NetworkError(`Could not read ${path}: ${err.message}`);
  }
  const people = built.people;
  return {
    path,
    encoding: decoded.encoding,
    includeLinks,
    D: built.D,
    people,
    idf: buildIdf(people),
    byEmployer: groupBy(people.filter(p => p.company), p => keyOf(p.company))
  };
}

/* ---------------- helpers ---------------- */

const keyOf = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const fold = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function groupBy(list, key) {
  const m = new Map();
  for (const x of list) { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
}

const isoDate = t => (t ? new Date(t).toISOString().slice(0, 10) : null);

/** One person as a tool returns them: no email, and no link unless asked for. */
function card(net, p, extra = {}) {
  const out = {
    name: p.name,
    role: p.role || null,
    company: p.company || null,
    field: p.domain,
    other_fields: (p.domains || []).filter(d => d !== p.domain),
    seniority: p.seniority,
    headline: p.headline || null,
    connected_on: isoDate(p.connectedOn),
    ...extra
  };
  if (net.includeLinks && p.slug) out.profile_url = `https://www.linkedin.com/in/${p.slug}/`;
  return out;
}

function page(items, { limit = 20, offset = 0 }) {
  const lim = Math.max(1, Math.min(100, Math.floor(limit) || 20));
  const off = Math.max(0, Math.floor(offset) || 0);
  const slice = items.slice(off, off + lim);
  return {
    total: items.length,
    count: slice.length,
    offset: off,
    has_more: off + slice.length < items.length,
    next_offset: off + slice.length < items.length ? off + slice.length : null,
    slice
  };
}

function countBy(list, key) {
  const m = new Map();
  for (const x of list) { const k = key(x); if (k) m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/** Match a field name loosely: "insurance" finds "Insurance, Risk & Finance". */
function resolveField(net, field) {
  if (!field) return null;
  const want = fold(field);
  const exact = net.D.doms.find(d => fold(d) === want);
  if (exact) return exact;
  const part = net.D.doms.filter(d => fold(d).includes(want));
  if (part.length === 1) return part[0];
  throw new NetworkError(part.length
    ? `"${field}" matches several fields: ${part.join('; ')}. Use one of them exactly.`
    : `No field called "${field}". Fields in this network: ${net.D.doms.join('; ')}.`);
}

function resolveSeniority(level) {
  if (!level) return null;
  const want = fold(level);
  const i = SEN_ORDER.findIndex(s => fold(s) === want || fold(s).includes(want));
  if (i < 0) throw new NetworkError(`No seniority "${level}". Use one of: ${SEN_ORDER.join('; ')}.`);
  return i;
}

/* ---------------- the tools ---------------- */

/** The shape of the whole network: counts, fields, seniority, biggest employers. */
export function overview(net) {
  const { D, people } = net;
  const dates = people.map(p => p.connectedOn).filter(Boolean);
  let lo = Infinity, hi = -Infinity;
  for (const t of dates) { if (t < lo) lo = t; if (t > hi) hi = t; }
  return {
    people: people.length,
    with_employer: D.namedCompany,
    employer_hubs: D.comps.length,
    fields: D.doms.map((d, i) => ({ field: d, people: D.domCounts[i] })),
    seniority: SEN_ORDER.map((s, i) => ({ level: s, people: D.senCounts[i] || 0 })),
    top_employers: D.comps.slice(0, 15).map((c, i) => ({ employer: c, people: D.compCounts[i] })),
    connected_between: dates.length ? [isoDate(lo), isoDate(hi)] : null,
    notes: [
      'Fields and seniority are inferred from job titles; "Other" means the title could not be placed and "Unstated" means no rank was given.',
      'The export has no location. Where someone is based cannot be answered from it.'
    ]
  };
}

/**
 * A question in plain English, answered the way the web page answers it: the
 * question becomes a filter (shown, so it can be checked), the network is
 * ranked against it.
 */
export function ask(net, { question, limit = 20, offset = 0 }) {
  if (!question || !String(question).trim()) throw new NetworkError('Ask a question, e.g. "who can intro me to a VC?" or "anyone in satellite imagery?".');
  const filter = resolveQuery(String(question));
  const results = runQuery(filter, net.people, { idf: net.idf, now: Date.now() });
  const caveats = [];
  if (filter.location) {
    caveats.push(`The question names a place (${(filter.location.cities || []).join(', ')}), but the export has no location, so it was not applied. ` +
      'Employers can be placed with the web app’s optional enrichment; this server works from the export alone.');
  }
  if (!results.length) {
    caveats.push(filter.subjects.length || filter.functions.length || filter.facets.length || filter.terms.length
      ? 'Nobody matched. Try the words people would put in a job title, or a broader field (see network_overview for the fields).'
      : 'The question has nothing specific to match on. Name a field, a job function, a seniority or a distinctive word.');
  }
  const p = page(results, { limit, offset });
  return {
    question: String(question),
    interpreted_as: describe(filter),
    total: p.total, count: p.count, offset: p.offset, has_more: p.has_more, next_offset: p.next_offset,
    people: p.slice.map((r, i) => card(net, r, { rank: p.offset + i + 1, matched_on: r.why || [] })),
    caveats
  };
}

/** People by name: best first — whole-name prefix, then any word, then anywhere. */
export function findPerson(net, { name, limit = 10 }) {
  const q = fold(name).trim();
  if (q.length < 2) throw new NetworkError('Give at least two letters of a name.');
  const hits = [];
  for (const p of net.people) {
    const n = fold(p.name);
    const rank = n.startsWith(q) ? 0 : n.split(/\s+/).some(w => w.startsWith(q)) ? 1 : n.includes(q) ? 2 : -1;
    if (rank >= 0) hits.push({ p, rank });
  }
  hits.sort((a, b) => a.rank - b.rank || a.p.name.length - b.p.name.length);
  const lim = Math.max(1, Math.min(50, Math.floor(limit) || 10));
  return {
    query: name,
    total: hits.length,
    people: hits.slice(0, lim).map(({ p }) => {
      const colleagues = p.company ? (net.byEmployer.get(keyOf(p.company)) || []).filter(x => x !== p) : [];
      return card(net, p, {
        colleagues_you_know: colleagues.length,
        colleagues: colleagues.slice(0, 8).map(c => ({ name: c.name, role: c.role || null }))
      });
    })
  };
}

/** A structured slice of the network: by field, employer, seniority and/or a word. */
export function listPeople(net, { field, employer, seniority, min_seniority, contains, sort = 'recent', limit = 20, offset = 0 }) {
  const f = resolveField(net, field);
  const exact = seniority ? resolveSeniority(seniority) : null;
  const floor = min_seniority ? resolveSeniority(min_seniority) : null;
  const emp = employer ? fold(employer) : null;
  const word = contains ? fold(contains) : null;
  let list = net.people.filter(p =>
    (!f || p.domain === f || (p.domains || []).includes(f)) &&
    (exact == null || SEN_ORDER.indexOf(p.seniority) === exact) &&
    (floor == null || (SEN_ORDER.indexOf(p.seniority) <= floor && p.seniority !== 'Unstated')) &&
    (!emp || fold(p.company).includes(emp)) &&
    (!word || fold(`${p.role} ${p.company} ${p.headline}`).includes(word)));
  list = sort === 'name'
    ? list.sort((a, b) => a.name.localeCompare(b.name))
    : sort === 'seniority'
      ? list.sort((a, b) => SEN_ORDER.indexOf(a.seniority) - SEN_ORDER.indexOf(b.seniority))
      : list.sort((a, b) => (b.connectedOn || 0) - (a.connectedOn || 0));
  const p = page(list, { limit, offset });
  return {
    filters: { field: f, employer: employer || null, seniority: exact != null ? SEN_ORDER[exact] : null,
      min_seniority: floor != null ? SEN_ORDER[floor] : null, contains: contains || null, sort },
    total: p.total, count: p.count, offset: p.offset, has_more: p.has_more, next_offset: p.next_offset,
    people: p.slice.map(x => card(net, x))
  };
}

/** Employers ranked by how many of your connections work there. */
export function listEmployers(net, { field, contains, min_people = 2, limit = 25, offset = 0 }) {
  const f = resolveField(net, field);
  const word = contains ? fold(contains) : null;
  const rows = [];
  for (const [, staff] of net.byEmployer) {
    const inField = f ? staff.filter(p => p.domain === f) : staff;
    if (!inField.length || staff.length < Math.max(1, min_people)) continue;
    const name = staff[0].company;
    if (word && !fold(name).includes(word)) continue;
    rows.push({ employer: name, people: staff.length, in_field: f ? inField.length : undefined,
      main_fields: countBy(staff, p => p.domain).slice(0, 3).map(([d]) => d) });
  }
  rows.sort((a, b) => (b.in_field ?? b.people) - (a.in_field ?? a.people) || b.people - a.people);
  const p = page(rows, { limit, offset });
  return { filters: { field: f, contains: contains || null, min_people },
    total: p.total, count: p.count, offset: p.offset, has_more: p.has_more, next_offset: p.next_offset, employers: p.slice };
}

/** Everyone you know at one employer, most senior first. */
export function getEmployer(net, { name, limit = 50 }) {
  const want = fold(name).trim();
  if (!want) throw new NetworkError('Give an employer name.');
  const keys = [...net.byEmployer.keys()];
  const key = keys.find(k => fold(k) === want) ||
    keys.filter(k => fold(k).includes(want)).sort((a, b) => net.byEmployer.get(b).length - net.byEmployer.get(a).length)[0];
  if (!key) throw new NetworkError(`Nobody in this network names an employer like "${name}". Try network_list_employers with contains="${name.split(/\s+/)[0]}".`);
  const staff = [...net.byEmployer.get(key)].sort((a, b) => SEN_ORDER.indexOf(a.seniority) - SEN_ORDER.indexOf(b.seniority));
  const lim = Math.max(1, Math.min(200, Math.floor(limit) || 50));
  return {
    employer: staff[0].company,
    people: staff.length,
    seniority: countBy(staff, p => p.seniority).map(([level, n]) => ({ level, people: n })),
    fields: countBy(staff, p => p.domain).map(([field, n]) => ({ field, people: n })),
    staff: staff.slice(0, lim).map(p => card(net, p)),
    has_more: staff.length > lim
  };
}
