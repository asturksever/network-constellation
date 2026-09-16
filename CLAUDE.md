# Network Constellation — working notes for Claude

A 3D force-directed view of your LinkedIn connections, clustered by what people do.
Static site, no framework, no bundler, no `node_modules`.

**Starting a new iteration? Read [docs/next-iteration.md](docs/next-iteration.md)
first.** It has the current state (pushed to a private GitHub repo, logos
fetched, bundle stale), the one decision that is blocking the ask-your-graph UI
with the payload sizes measured, and the ranked backlog behind it.

## Run it

```bash
npm run data     # data/followers.csv  -> data/graph-data.json
npm run logos    # fetch employer logos -> logos/  (needs open internet, see below)
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
src/ask.js            question -> structured filter -> ranked shortlist (see docs/)
src/palette.js        OKLCH colour generation — the domain hues and seniority ramp
src/graph.js          node/link model, force-graph setup, camera framing
src/labels.js         domain labels projected from 3D, with collision culling
src/highlight.js      the search-hit marker: ping, reticle and card, projected too
src/logos.js          employer logos projected from 3D, sized by headcount
src/ui.js             control panel, tooltip, status line
src/main.js           boot: load data -> build world -> wire UI
scripts/build-data.mjs     CSV -> compact graph JSON
scripts/fetch-logos.mjs    employer name -> domain -> favicon -> logos/
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

**Logos can only be fetched from your own machine.** Both Claude sandboxes are
walled off from logo services — the cloud container's egress proxy denies them,
and the sandbox on your Mac runs with `--unshare-net`, so it has no network at
all. `npm run logos` therefore has to be run by you, in a normal terminal. It is
also the reason a server can't be started for you: that sandbox is torn down
with `--die-with-parent` after every command.

**The bundle must carry its own charset.** `bundle.mjs` emits
`<meta charset="utf-8">` as its first line. The Artifact wrapper supplies one, so
this looked fine when published and was mojibake for anyone who opened the built
file off disk. Don't drop it.

**One top-level name per module.** Every module is concatenated into a single
scope, so two modules declaring the same `const` is a SyntaxError in the bundle
and perfectly legal in the browser — the failure only appears in the built file.
`bundle.mjs` checks for this and refuses. `$`, `esc` and `fmt` live in
`src/dom.js` for exactly this reason; import them, never redeclare them.

## Two input shapes

`build-data.mjs` reads both without a flag: a headline export (Name / Full
headline / Profile URL) and LinkedIn's own **Connections.csv** from Settings ->
Get a copy of your data. The official export is what the README leads with — it
is the user's data by right, needs no session cookie, and cannot break when an
internal endpoint changes. It carries no headline, so one is composed as
`Position at Company`, which is exactly the shape `classify.js` reads, and the
"Notes:" preamble lines are stripped before parsing. Verified byte-identical
output on the 10,144-row headline export after that change.

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
- **Every placeable domain has its own hue**, generated in `palette.js` rather
  than picked. Hues step by the golden angle in domain-size order so the biggest
  lobes land furthest apart on the wheel; three lightness bands cycle alongside,
  which pulls apart the pairs that would otherwise converge once you pass a
  dozen categories. Measured against the `#080b0e` ground: contrast 4.3–10.5:1,
  worst pair among the top 20 domains ΔE 9.6. The last few of 29 do converge
  (worst ΔE 1.4) — acceptable only because they are tiny, spatially distant and
  permanently labelled. A chart could not get away with this; a labelled force
  graph can, because hue is reinforcement here, not the sole identity channel.
- `Other` and `No headline` stay grey on purpose. That greyness means "we could
  not place these people", and it should keep meaning that.
- Employer hubs stay achromatic-warm so node **kind** never reads as a domain hue.
- Links are tinted with their cluster's hue at ~13% alpha. This is what makes the
  scene read as coloured light rather than a grey web with coloured dots.
- Domain labels are HTML projected via `graph2ScreenCoords`, not sprites — crisp
  text, no extra library, and collision culling keeps the middle readable.
- A search hit has to announce itself. One person is a 0.55-unit dot in ten
  thousand, so finding one turns the node white-hot (nothing else in the scene
  reaches that value — the employer hubs own the warm end), lights its two
  spokes gold, swoops the camera in two stages rather than cutting, and locks an
  HTML marker onto its projected position: sonar ping, targeting reticle, and a
  card that opens the profile. Enter steps through the other matches. The marker
  is HTML on purpose — a hit can be occluded by geometry in front of it, and the
  overlay is the thing that can never be hidden.
- `setHit` clears `wantFrame`, and `onSettle` skips re-framing while a hit is
  live. Without both, the engine's settle would yank the camera off the person
  you just searched for.
- Camera framing is percentile-based (93rd for the whole graph, 90th for a
  cluster) so a few outliers can't push the view into the next county.

## Ask your graph

`src/ask.js` resolves a natural-language question to a structured filter and runs
it locally — no model, no API key, 140 ms over 10k people. It works because
`taxonomy.js` is bidirectional: the regexes that classify headlines also parse
questions. An LLM is an optional layer over the ~20 survivors, never a dependency.
Design note and measured results: `docs/ask-your-graph.md`.

Two things there are load-bearing and easy to undo by accident. Subject domains
and `FUNCTION_DOMAINS` are intersected, not unioned — union returns every
salesperson you know. And free terms are IDF-weighted, or common words bury the
distinctive ones.

## Roadmap

1. **Reusable tool** — file input, run `classify.js` in the browser, no baked-in
   data. The shared modules are already shaped for this; what's missing is a
   drop zone, a column mapper, and moving `build-data.mjs`'s aggregation step
   into a module both hosts can call.
0. **Logo coverage** — `fetch-logos.mjs` maps ~70 well-known employers to domains
   by hand and guesses the rest as `slug.com`. Extend `DOMAINS` there when a hub
   you care about shows a bare sphere; misses are silent by design.
2. **Better clustering & filters** — seniority layering, multi-domain membership
   (people currently sit in one cluster though `domains` holds all matches),
   a company-centric view, saved views.
3. **Visual polish** — bloom, better materials, an intro animation, node halos,
   screenshot export.

## Housekeeping

`data/` is gitignored as a whole directory (with `.gitkeep` re-included), not as
a list of filenames — a stray export dropped there under any name must not be
committable. `logos/`, `dist/`, `*.csv`, `*.xlsx`, `*.zip` and `.env` are out
too. `dist/` matters as much as `data/`: the bundle has the names inlined.

The history was audited before the repo went to GitHub — no data file, logo or
session token has ever been committed, so it is safe to flip public.
