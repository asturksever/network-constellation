# Contributing

There is nothing to install. `npm` is a task runner here and the project has no
dependencies — that is deliberate, and worth keeping.

```bash
npm run check        # node --check over every module
npm test             # node:test, no framework
npm run bundle:demo  # the single-file build; catches duplicate top-level names
npm run dev          # http://localhost:8080
npm run pages        # http://localhost:8090, as GitHub Pages will serve it
```

The first three run in CI on every push and pull request. `npm run pages`
hides `data/`, `logos/`, `dist/` and `vendor/`, and runs on its own origin, so
it is the way to see the landing page and the demo on a machine that has a
real graph on disk.

## Reporting a bug

[Open an issue](https://github.com/asturksever/network-constellation/issues/new/choose)
and pick **Something is broken**. Say what you did, what you expected and what
happened, which browser, and whether it was the demo or your own file. Copy the
status line or the landing message, and anything red in the browser console.

**Never paste names, headlines or rows from your own export**, in an issue, a
screenshot or a pull request. They are other people's details, and an issue is
public. Reproduce with the demo if you can (it is 250 invented people), or
describe the shape of the data instead: "a headline with two @ signs", "a
Company column that is empty for half the rows".

Before filing, [the install guide's troubleshooting](docs/install.md#troubleshooting)
covers every message the app can show.

## Asking for a feature

Pick **An idea**. Lead with the question you are trying to answer about your
network, not the feature. "I want to find people who changed jobs this year"
leads somewhere; "add a filter" doesn't.

Ideas that keep the tool running in the browser, and sending nothing without a
key and a click, are much easier to take. Anything that needs data LinkedIn
does not give you (who knows whom, where people live) is out of reach. The
README's "What this is honest about" explains why.

## When a field is wrong

Pick **A field is wrong, or people land in "Other"**. Give a few example job
titles in your own words, where they landed, and where they belong. Or fix it
yourself: see the next section. This is the report that improves the tool
most.

## Security and privacy problems

Don't open a public issue. Use **Security → Report a vulnerability** on the
repository. [SECURITY.md](SECURITY.md) lists what counts.

## Sending a change

1. Fork, and branch from `main`.
2. Keep the change small and about one thing.
3. Run `npm run check && npm test && npm run bundle:demo`, and look at the
   result in a browser (`npm run pages` shows it as the public site will).
4. Open a pull request. The template has a short checklist. Say why, not only
   what.

There are no dependencies and no build step. Please keep it that way: a change
that needs a package probably wants a conversation first, in an issue.

## The most useful thing you can change

`src/taxonomy.js`. It is a list of regexes that decides which cluster a person
lands in, and it is wrong in ways only someone with a different network can see.
If your field comes out as "Other", that file is where to fix it.

It is bidirectional: the same regexes that classify a headline also parse a
question, so adding a domain improves both at once.

## Rules that are load-bearing

Each of these was a bug that took real time to find. They are in `CLAUDE.md`
with the reasoning; the short version:

- **Subject domains and function domains are intersected, never unioned.** A
  union returns every salesperson in the network.
- **Free terms stay IDF-weighted**, or common words bury the distinctive ones.
- **Employer extraction is one uniform rule for every headline.** A curated list
  of well-known brands was tried and thrown away: it inflated the big employers
  and undercounted everyone else.
- **Location is the employer's headquarters, never a person's home**, and the UI
  has to keep saying so.

## The bundler

`scripts/bundle.mjs` is forty lines that strip `import`/`export` and concatenate
modules in `MODULE_ORDER`. That buys a dependency-free build and costs four
constraints, all of which the script enforces by refusing to build:

- no `export default`, no `import * as`, no renamed imports
- no two modules declaring the same top-level name — everything lands in one
  scope, so a second `const esc` is a syntax error in the bundle and perfectly
  fine in the browser
- add new modules to `MODULE_ORDER` in dependency order

If the module graph ever genuinely outgrows this, replace the whole script with
esbuild. Do not teach the stripper new tricks.

## Changing the classifier

The classifier is deterministic, so rebuilding and diffing is a real regression
test. `test/build.test.mjs` holds a snapshot of the sample graph:

```bash
npm test                          # fails if classification changed
UPDATE_FIXTURES=1 npm test        # accept the change
```

Reclassification is often the point, so a changed snapshot is not a failure.
Read the diff and check it changed what you meant and nothing else. If you have
a real export on disk, diff `data/graph-data.json` before and after as well.

## Things to look at rather than reason about

Anything touching colour, the camera or the marker overlay. Three separate bugs
there — the camera landing inside the graph, the hit node rendering as a wall
that filled the screen, and the settle handler yanking the camera off a search
hit — were all invisible in the code and obvious in a screenshot. Run it and
look at it. The force simulation takes about twelve seconds on 10,000 nodes;
wait for the status line to read "Settled" before interacting.

## Privacy

Never commit a CSV, a built graph, a logo or a key. `data/`, `logos/` and
`dist/` are gitignored as whole directories rather than as patterns, so a stray
export dropped in under any name cannot be committed. The one committed CSV is
`sample/sample-connections.csv`, which is entirely invented people.

If you add anything that sends data anywhere, say so in the README's Privacy
section in the same change, and add its origin to the Content-Security-Policy
in `index.html`, or the browser will refuse it.

Screenshots in `docs/` are of the demo only: 250 invented people from
`sample/sample-connections.csv`. Never a real export, not even blurred.
