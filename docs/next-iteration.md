# Handover: where this stands and what to do next

Written 16 September 2026, at the end of the Cowork session that built the
search highlight and prepared the repo for GitHub. Read `CLAUDE.md` first for
how the project works. This file is only about state and what is still open.

## State

- 5 commits on `master`, pushed to `git@github.com:asturksever/network-constellation.git`,
  private, working tree clean, in sync with origin.
- History audited before the first push: no CSV, no `graph-data.json`, no logo
  and no session token has ever been committed. Safe to flip public with no
  history surgery.
- `logos/` is populated (159 files plus `manifest.json`). `data/followers.csv`
  and `data/graph-data.json` are present locally and correctly ignored.
- Everything is verified working: `npm run data` reproduces the committed
  graph byte for byte, and the app runs at `npm run dev`.

## Do these first, they are quick

1. **Delete `.git/_stale`.** 48 files, 188 KB of lock and temp-object junk. It
   exists because the Cowork sandbox on the Mac cannot unlink files, so every
   commit had to move git's own locks aside. Claude Code running natively has
   no such restriction: `rm -rf .git/_stale` and never think about it again.
   Do not reintroduce the workaround.
2. **Rebuild `dist/`.** The bundle on disk is from before both the charset fix
   and the search highlight, so it is two features stale. `npm run bundle`.
3. **Decide `master` vs `main`.** The repo is on `master` by local git default.
   If it is going public, rename now, before anyone clones or links a line:
   `git branch -m master main && git push -u origin main` then switch the
   default branch in the GitHub settings and delete the old remote branch.

## The one real blocker: ask-your-graph has no UI

`src/ask.js` is finished, tested and in `MODULE_ORDER`, but nothing calls it.
Nothing in `main.js`, `ui.js` or `index.html` references `ask`, `resolveQuery`
or `runQuery`. The feature that the LinkedIn post describes is, today,
reachable only from a Node REPL.

It is blocked on one decision that was raised and never settled.

`ask.js` scores a person against role, company **and headline**. The headline is
the richest signal it has. But `build-data.mjs` drops headlines from
`graph-data.json` to keep the payload at 1.03 MB, so in the browser the scorer
would be working with a third of its evidence.

Measured on the real 10,144-person set (base payload 1,084,344 bytes):

| Option | Added | Total | Notes |
|---|---|---|---|
| A. Ship full headlines | +749 KB (+69%) | 1.75 MB | Simplest. Also the only option that lets you *show* the matched headline in results, which is what makes a shortlist trustworthy. |
| B. Trimmed search field | +301 KB (+28%) | 1.32 MB | Headline lowercased, words already present in role or company removed, deduped, stopworded. Roughly a 10-line change: one more string to concatenate into the scored text. Keeps substring matching. |
| C. Inverted index, df>=1 | +255 KB (+24%) | 1.28 MB | 7,397 terms. Smallest option that loses no vocabulary, but it restructures `runQuery` from a linear scan into posting-list intersection, and it is exact-token only. |
| C'. Inverted index, df>=2 | +176 KB (+16%) | 1.26 MB | Cheapest, but it discards 4,733 singleton terms, which are precisely the rare high-IDF words the ranking leans on hardest. Do not pick this one for the sake of 79 KB. |

**Recommendation: B.** It costs 46 KB more than the best index and needs a
tenth of the code change, and `ask.js` runs in about 60 ms already, so the
index's speed advantage buys nothing that matters. If results should display
the evidence that produced them, A is the honest choice and 1.75 MB is not
actually a problem for a local file.

Once the payload is decided, the UI is small: a text input, `ask()` on submit,
and a results panel. Two things it must do:

- **Show the query it ran.** `describe(filter)` returns a human-readable string
  for exactly this. A shortlist you cannot audit is a shortlist you cannot
  trust, and this is the whole reason that function exists.
- **Click a result to fly to that node.** `world.setHit(node)` plus
  `highlight.show(node)` plus `world.swoopTo(node)` already do this, wired up in
  `ui.js` for name search. Reuse it rather than writing a second path.

See `docs/ask-your-graph.md` for the design and the measured results.

## Backlog after that

1. **Drop in your own CSV.** The pitch is "map your own network", but the data
   is baked in. `taxonomy.js`, `classify.js` and `csv.js` are already free of
   DOM and filesystem calls so they run in both hosts. What is missing: a file
   drop zone, a column mapper, and moving the aggregation half of
   `build-data.mjs` into a module both Node and the browser can import.
2. **Logo coverage.** `fetch-logos.mjs` hand-maps about 70 employers and guesses
   the rest as `slug.com`. Extend `DOMAINS` there when a hub you care about
   shows a bare sphere. Misses are silent by design.
3. **Multi-domain membership.** `classify()` already returns every matching
   domain in `domains`, but a person is placed in exactly one cluster. Showing
   the others, even as faint secondary links, would be more truthful than the
   single-bucket view.
4. **Visual polish.** Bloom, better materials, an intro animation, screenshot
   export.

## Do not undo these

All three are in `CLAUDE.md` with the reasoning, repeated here because each was
a bug that took real time to find:

- Subject domains and `FUNCTION_DOMAINS` in `ask.js` are **intersected**, never
  unioned. Union returns every salesperson in the network.
- Free terms stay **IDF-weighted**, or common words bury the distinctive ones.
- Employer extraction uses **one uniform rule** for every headline. A curated
  list of well-known brands was tried first and had to be thrown away: it
  inflated the big employers and undercounted everyone else.

## How to check your work

There is no test suite. What was actually used, and works well:

The classifier is deterministic, so rebuilding and comparing is a real
regression test. Before changing `taxonomy.js`, `classify.js` or
`build-data.mjs`, snapshot the current output and diff against it after:

```bash
cp data/graph-data.json /tmp/before.json
npm run data
node -e "
const a=require('/tmp/before.json'), b=require('./data/graph-data.json');
const same = JSON.stringify(a.people)===JSON.stringify(b.people);
console.log(same ? 'identical' : 'CHANGED');
if (!same) a.people.forEach((p,i)=>{
  if (JSON.stringify(p)!==JSON.stringify(b.people[i]))
    console.log(p[0], JSON.stringify(p), '->', JSON.stringify(b.people[i]));
});
" | head -40
```

Reclassification is often the point, so "CHANGED" is not a failure. The diff
tells you whether it changed what you meant and nothing else.

For the visual side, the reliable method was headless Chromium against the
bundle, driving the real UI and screenshotting it. Note that `npm run bundle`
loads the force-graph library from a CDN, so for an offline check you have to
splice `vendor/3d-force-graph.min.js` inline first (`npm run vendor` fetches
it). Wait for the status line to read "Settled" before interacting: the force
simulation takes about 12 seconds on 10k nodes.

Anything touching colour, camera or the marker overlay should be looked at, not
reasoned about. Three separate bugs in this area (the camera landing inside the
graph, the hit node rendering as a wall that filled the screen, and the settle
handler yanking the camera off a search hit) were all invisible in the code and
obvious in a screenshot.
