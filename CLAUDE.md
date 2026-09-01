# Network Constellation — working notes for Claude

A 3D force-directed view of a LinkedIn following, clustered by what people do.
Static site, no framework, no bundler, no `node_modules`.

## Run it

```bash
npm run data     # data/followers.csv  -> data/graph-data.json
npm run dev      # http://localhost:8080
npm run bundle   # -> dist/network-constellation.html (single file, for publishing)
npm run vendor   # optional: local copy of the force-graph lib for offline dev
```

There are no dependencies to install. `npm` is used only as a task runner;
`package.json` has `"type": "module"` so Node treats `.js` as ESM, which is what
lets the same files run in Node and the browser.

## Layout

```
index.html            markup + the CDN <script> for 3d-force-graph
src/taxonomy.js       the classification rules — edit here when a bucket is wrong
src/classify.js       headline -> {role, company, seniority, domain, domains, tier}
src/csv.js            dependency-free CSV parse/serialise
src/graph.js          node/link model, force-graph setup, camera framing
src/labels.js         domain labels projected from 3D, with collision culling
src/ui.js             control panel, tooltip, status line
src/main.js           boot: load data -> build world -> wire UI
scripts/pull-followers.js  paste into the browser console to pull a fresh CSV
scripts/build-data.mjs     CSV -> compact graph JSON
scripts/bundle.mjs         flatten everything into one publishable HTML
```

`src/taxonomy.js`, `src/classify.js` and `src/csv.js` are deliberately free of
DOM and filesystem calls so they run in both hosts. Keep them that way — the
"drop in your own CSV" feature depends on the browser being able to import them.

## Two constraints that will bite

**The bundler is 40 lines and naive.** `scripts/bundle.mjs` flattens modules by
stripping `import`/`export` and concatenating in the order listed in
`MODULE_ORDER`. It rejects `export default`, `import * as`, and renamed imports
rather than producing something broken. If you add a module to `src/` that the
browser needs, add it to `MODULE_ORDER` in dependency order. If the module graph
ever gets genuinely complex, replace the whole script with esbuild — don't teach
the stripper new tricks.

**The pull uses a private endpoint.** `scripts/pull-followers.js` calls
LinkedIn's internal Voyager GraphQL API with the logged-in session cookie. It is
undocumented and the `queryId` changes without notice. When a pull returns
nothing, open the followers page, watch the network tab while clicking "Show
more results", and copy the fresh `queryId` across. Keep the inter-page delay.

## What the data honestly is

- **Edges are memberships, not relationships.** Person -> domain, and person ->
  employer where 2+ people name the same one. LinkedIn does not expose
  follower-to-follower connections anywhere — not in the feed payload, not as a
  facet. Any feature premised on a real social graph needs a different source.
- **No geography, on purpose.** Location is absent from the followers feed and
  per-profile only exists after a page renders. Inferring country from names or
  employers was considered and rejected; it would be guesswork wearing a map.
- **Company is present for ~29% of people.** Extracted by one uniform rule (the
  capitalised run after "at" or "@") applied to every headline. An earlier
  version matched against a list of well-known brands first and had to be thrown
  away — it inflated big employers and undercounted everyone else. Don't
  reintroduce a brand list.
- **~29% state no seniority.** They write a tagline, not a title. "Unstated" is a
  real category, not missing data to be filled in.
- **Roles are self-descriptions**, not verified job titles.

## Design rules the visuals follow

- Deliberately single-theme. A 3D scene is its own world; every colour is
  painted explicitly rather than inherited.
- Only three categorical hues are ever on screen at once (`PALETTE.series`),
  validated as an all-pairs colourblind-safe trio against the `#080b0e` ground.
  29 hues would be confetti. Identity for the other domains comes from the
  isolate dropdown and the projected hub labels, not from more colours.
- Domain labels are HTML projected via `graph2ScreenCoords`, not sprites — crisp
  text, no extra library, and collision culling keeps the middle readable.
- Camera framing is percentile-based (93rd for the whole graph, 90th for a
  cluster) so a few outliers can't push the view into the next county.

## Roadmap

1. **Reusable tool** — file input, run `classify.js` in the browser, no baked-in
   data. The shared modules are already shaped for this; what's missing is a
   drop zone, a column mapper, and moving `build-data.mjs`'s aggregation step
   into a module both hosts can call.
2. **Better clustering & filters** — seniority layering, multi-domain membership
   (people currently sit in one cluster though `domains` holds all matches),
   a company-centric view, saved views.
3. **Visual polish** — bloom, better materials, an intro animation, node halos,
   screenshot export.

## Housekeeping

`data/` is gitignored — it holds real people's names and profile URLs. Keep it
that way. `dist/` is gitignored too; the bundle is a build product.
