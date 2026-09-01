# Network Constellation

A 3D force-directed view of a LinkedIn following, clustered by what people
actually do. Every follower becomes a node, pulled toward the domain their
headline puts them in and toward any employer they share with someone else.

## Quick start

```bash
git clone <this repo> && cd network-constellation

# 1. get your data — see "Pulling your followers" below
cp ~/Downloads/linkedin-followers-*.csv data/followers.csv

# 2. classify it
npm run data

# 3. look at it
npm run dev        # http://localhost:8080
```

No dependencies to install. `npm` is only a task runner here.

## Pulling your followers

1. Log in to LinkedIn in a normal browser tab.
2. Go to **My Network → Manage follows → Followers**.
3. Open DevTools → Console, paste all of `scripts/pull-followers.js`, hit Enter.
4. It pages through your followers and downloads a CSV.
5. Move it to `data/followers.csv` and run `npm run data`.

This calls LinkedIn's own internal endpoint with your existing session — the
same one the page uses. It is undocumented and can change; if a pull comes back
empty, see the note in `CLAUDE.md`.

Any CSV with a name column and a headline column works, so you can point this at
an export from somewhere else instead.

## What you're looking at

**Nodes.** One per person, plus a hub per domain, a hub per employer named by
two or more people, and a single root for the account being followed.

**Edges.** Person → domain, person → employer. These are *memberships, not
relationships*: LinkedIn does not expose who follows whom, so this is a map of
what people have in common rather than who knows whom.

**Colour.** The three largest domains get a hue; the rest stay neutral. That's a
deliberate limit — colourblind-safe categorical palettes run out at three when
any two colours can end up adjacent, which is exactly the case in a force graph.
Use **Isolate a domain** to light up any of the others.

**Controls.** Density (everyone / senior only / hubs only), domain isolation,
name search, and a toggle for the employer links. Hover for role and employer,
click a person to open their profile.

## Publishing

```bash
npm run bundle     # dist/network-constellation.html
```

One self-contained file with the data inlined, sized for publishing as a Claude
Artifact.

## Caveats worth repeating

- Roles are what people wrote about themselves, not verified titles.
- Employer is known for roughly 29% of people — a blank means "didn't say".
- Roughly 29% state no seniority at all.
- There is no geography here. LinkedIn doesn't expose follower location in bulk,
  and guessing it from names or employers would be fiction.

## Licence

Private project. `data/` is gitignored and should stay that way — it holds real
people's names and profile links.
