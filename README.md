# Network Constellation

A 3D map of your LinkedIn network, arranged by what people actually do. Every
connection becomes a node pulled toward the domain their job title puts them in
and toward any employer they share with someone else. Then you can ask it
questions.

![The whole graph: 10,144 people in 29 domain clusters](docs/hero.png)

It exists because LinkedIn search answers "who matches this keyword" and not
"who do I already know who works in PropTech". Those are different questions,
and only one of them is useful when you need an introduction.

- **See the shape of your network.** 29 domains fall out of the classifier, each
  its own cluster and its own generated hue. Employer hubs sit between them,
  drawn with the company logo, sized by how many of your contacts work there.
- **Find one person instantly.** Type a name: the node goes white-hot, its
  domain and employer links light up, the camera swoops in, and a marker locks
  on with their role and a link to their profile. Enter steps through the rest
  of the matches.
- **Ask it a question.** "Who do I know in insurance?" resolves to a structured
  filter and runs locally over the whole set in about 60 ms — no model, no API
  key, nothing sent anywhere. See [docs/ask-your-graph.md](docs/ask-your-graph.md).

## Quick start

You need Node 18+ and Python 3 (only for the dev server). There is nothing to
`npm install` — there are no dependencies.

```bash
git clone <this repo> && cd network-constellation
```

**1. Get your data.** On LinkedIn go to **Settings → Data privacy → Get a copy
of your data**, tick **Connections**, and request the archive. It arrives by
email, usually within ten minutes. Unzip it and:

```bash
cp ~/Downloads/Basic_LinkedInDataExport_*/Connections.csv data/followers.csv
```

This is your data under GDPR Article 20 — no scraping, no session cookie, and
nothing that breaks when LinkedIn changes an internal endpoint. The export has
no headline field, so one is composed from `Position at Company`, which is what
the classifier reads anyway.

**2. Build the graph.**

```bash
npm run data
```

It prints what it found: people, domains, employer hubs, and how much of the set
it could and could not place.

**3. Optional — employer logos.**

```bash
npm run logos
```

Fetches a favicon per employer hub. Without it you get plain spheres and nothing
breaks. Needs open internet, and misses are silent by design.

**4. Look at it.**

```bash
npm run dev        # http://localhost:8080
```

### Other data sources

`scripts/build-data.mjs` matches column names loosely and takes any CSV with a
name and either a headline or a position, so an export from somewhere else works
if it carries those columns.

The official export is the only LinkedIn path this project supports. An earlier
version shipped a console script that pulled *followers* through LinkedIn's
internal API with your session cookie; it was undocumented, broke without notice
and sat against LinkedIn's terms, so it is gone. Followers who are not
connections are not available.

## What you're looking at

**Nodes.** One per person, plus a hub per domain, a hub per employer named by
two or more people, and a single root.

**Edges.** Person → domain and person → employer. These are *memberships, not
relationships*. LinkedIn does not expose who knows whom, so this is a map of
what people have in common — not a social graph, and it should not be read as
one.

**Colour.** Every placeable domain gets its own generated hue, golden-angle
spaced across three lightness bands so the big clusters never collide, with the
spokes tinted to match. `Other` and `No headline` stay grey, because that grey
means "couldn't place these people" and should keep meaning it. Switch **Colour
by** to *Seniority* to repaint the scene by rank instead.

**Controls.** Density (everyone / senior only / hubs only), colour by domain or
seniority, isolate a domain (or click any legend row), name search, and toggles
for employer links and logos. Hover for role and employer; click a person to
open their profile.

## Publishing one

```bash
npm run bundle     # dist/network-constellation.html
```

One self-contained file with the data and logos inlined — no server, no CDN for
anything but the graph library. Note that it contains your contacts' names and
profile links, so treat it like the export it came from.

## What this is honest about

- **Roles are self-descriptions**, not verified titles.
- **Employer is known for about 29% of people** in my own graph. A blank means
  they didn't state one, not that they're unemployed. Extraction is one uniform
  rule applied to every row — matching a curated list of well-known brands first
  was tried and thrown away, because it inflated the big employers and
  undercounted everyone else.
- **About 29% state no seniority.** "Unstated" is a real category, not missing
  data to be guessed at.
- **There is no geography here.** LinkedIn doesn't expose location in bulk, and
  inferring country from names or employers would be fiction wearing a map.
- **The classifier is regexes, not a model** — see `src/taxonomy.js`. It is
  legible and editable on purpose. When a bucket is wrong, that file is where
  you fix it, and the same rules that classify a job title also parse a
  question.

## Layout

```
src/taxonomy.js    the classification rules — edit here when a bucket is wrong
src/classify.js    title -> {role, company, seniority, domain}
src/ask.js         question -> structured filter -> ranked shortlist
src/palette.js     OKLCH colour generation
src/graph.js       node/link model, force-graph setup, camera
src/highlight.js   the search-hit marker
src/labels.js      domain labels projected from 3D
src/logos.js       employer logos projected from 3D, sized by headcount
src/ui.js          control panel, tooltip, status line
scripts/           build the data, fetch logos, bundle, pull followers
```

Built on [3d-force-graph](https://github.com/vasturiano/3d-force-graph).

## Privacy

`data/`, `logos/` and `dist/` are gitignored and should stay that way — they
hold real people's names and profile links. Nothing in this project sends your
data anywhere: every step runs on your machine, including the question
answering.

## Licence

MIT — see [LICENSE](LICENSE).
