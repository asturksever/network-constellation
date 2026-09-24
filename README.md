# Network Constellation

**See who you know.** Drop in your LinkedIn connections and they arrange
themselves by what people do: thousands of names become a few dozen clusters
you can orbit, search and question in plain English. It runs entirely in your
browser. Nothing is uploaded.

**[Try it →](https://asturksever.github.io/network-constellation/)** Start with
the built-in demo of 250 invented people, or drop your own export in.

![Asking the demo "who can intro me to a VC?": 23 people lit in the scene, the shortlist on the right](docs/hero.png)

LinkedIn search answers "who matches this keyword". It doesn't answer "who do
I already know in PropTech?", and that is the question that matters when you
need an introduction.

- **See the shape of your network.** Every connection is placed by the field
  their job puts them in, and joined to any employer they share with someone
  else. Each field is its own cluster in its own colour.
- **Ask it a question.** *Anyone in satellite imagery licensing?* is answered
  on your machine in milliseconds, with no model and no API key. The query it
  ran is shown above the answer, so you can check its reasoning.
- **Open the full picture.** Click anyone for their headline, employer and
  everyone else you know there. Click an employer for who works there.
- **Go deeper, if you want.** With your own Anthropic API key, Claude looks up
  where employers are based, so *any VC based in London?* can be answered. It
  can also research one person on the public web when you press **Enrich
  profile**.

## Get started

1. **Export your connections.** On LinkedIn, open
   [Get a copy of your data](https://www.linkedin.com/mypreferences/d/download-my-data),
   tick **Connections** and request the archive. It arrives by email, usually
   within ten minutes. This is your own data, so there's no scraping and no
   session cookie.
2. **Drop `Connections.csv` on [the page](https://asturksever.github.io/network-constellation/).**
   It is read and classified in that tab, and kept in that browser.
3. **Ask it something**, or just orbit it.

| | |
|---|---|
| **[Your first session →](docs/tutorial.md)** | A ten-minute walkthrough of everything, on the demo, with screenshots. |
| **[Install and self-host →](docs/install.md)** | Run it locally, build a single file, put your own copy on GitHub Pages, and troubleshooting. |
| **[How questions are answered →](docs/ask-your-graph.md)** | How a question becomes a filter, with measured results. |

![The landing page: the demo turning behind the drop zone](docs/img/landing.png)

## Privacy

Your CSV is read in the tab you dropped it into and kept in that browser's
storage (IndexedDB). It is never uploaded. There is no backend, no account and
no analytics. **Forget** in the control panel erases everything the page kept.

Without an API key, the page makes one request to anyone else: it loads the 3D
library from `cdn.jsdelivr.net`.

With your own Anthropic key, **three things can be sent to Anthropic, and
nothing else**:

1. **Employer names**, to look up headquarters and organisation type. Sent when
   you press **Look up employers** in Settings, or **Label** on one employer.
2. **The text of your questions**, each one you ask while a key is set, so
   Claude can read it more closely. Anything it adds is marked in the answer.
3. **One person's name, headline and employer**, only when you press **Enrich
   profile** on their panel, so Claude can search the public web for them.
   This is the only thing that ever sends a name, and it never runs by itself.

Never email addresses or profile links. Requests go straight from your browser
to `api.anthropic.com`, and the page's Content-Security-Policy lets its scripts
send data nowhere else. If a brief finds a public photo, your browser loads it
from the site that hosts it, as it would any image. Results are kept in your
browser, so nothing is paid for twice. Your key is kept only if you tick
**Remember**. Use a key with a spend limit.

What that costs: about $0.06 to place the employers that two or more of your
connections share, in a 10,000-person network. About $0.70 to place all of
them. $0.10–$0.30 for each **Enrich profile**.

`npm run logos` is a separate, optional build step on your own machine. It
sends domain guesses made from employer names to unavatar.io, DuckDuckGo and
Google to fetch favicons. Company names only, never people's.

## What this is honest about

- **The lines are memberships, not relationships.** A line joins a person to a
  field or to an employer, never to another person. LinkedIn doesn't share who
  knows whom, so this is a map of what people have in common, not a social
  graph.
- **Location means the employer's headquarters**, not where the person lives,
  and it exists only after enrichment. A location question leaves out anyone
  whose employer could not be placed, and says how many that was.
- **Roles are self-descriptions**, not verified titles.
- **Employer is what people state.** The official export carries one for most
  people; built from headlines alone it was about a third. A blank means they
  didn't state one.
- **Roughly a third state no seniority.** "Unstated" is a real category, not
  missing data to be guessed at.
- **The classifier is patterns, not a model.** See `src/taxonomy.js`: it is
  readable and editable on purpose. The same rules that classify a job title
  also parse a question.
- **An enriched profile can be about the wrong person.** Names collide. The
  brief says how confident it is and cites its sources. The prompt treats a
  confident brief about a namesake as the worst possible outcome.

## Run it yourself

Node 18 or newer. There are no dependencies, so there is nothing to install.

```bash
git clone https://github.com/asturksever/network-constellation.git
cd network-constellation
npm run dev            # http://localhost:8080
```

```bash
npm test               # the tests
npm run pages          # the site as GitHub Pages serves it, on :8090
npm run bundle:demo    # one self-contained HTML file with the demo, safe to share
npm run bundle         # the same with YOUR graph inside: keep it to yourself
```

The [install guide](docs/install.md) covers deploying your own copy, other
hosts, and what to do when something goes wrong.

## How it is built

A static page with no framework, no bundler and no dependencies. The ES
modules run the same in the browser and in Node, which is how the tests run.

```
index.html          the page, the landing and the Content-Security-Policy
src/taxonomy.js     the classification rules: edit here when a field is wrong
src/classify.js     headline -> role, company, seniority, field
src/csv.js          CSV reading, including Excel's encoding and wrong-file detection
src/build.js        rows -> the graph (shared by Node and the browser)
src/ask.js          question -> filter -> ranked shortlist, no model involved
src/graph.js        the 3D scene: nodes, links, colour, camera
src/palette.js      generated colours for every field
src/labels.js       field labels projected from 3D
src/highlight.js    the marker that locks onto a found person
src/logos.js        employer logos, when you have fetched them
src/dom.js          the small DOM helpers every UI module shares
src/ui.js           the control panel, tooltip and status line
src/overview.js     the network overview at the top of the panel
src/askui.js        the question box and its answer panel
src/detail.js       the person and employer panels
src/upload.js       the landing page, the drop and the column mapper
src/store.js        IndexedDB: your graph, employer facts and research briefs
src/llm.js          the optional Anthropic calls, with your key
src/enrich.js       employer names -> headquarters and organisation type
src/askllm.js       question -> extra filter constraints
src/research.js     one person -> a sourced brief, on a button only
src/enrichui.js     the Settings sheet
src/main.js         boot: find a graph or show the landing, then wire it all
scripts/            the dev server, the data build, logos and the bundler
test/               node:test, no framework
```

Built on [3d-force-graph](https://github.com/vasturiano/3d-force-graph).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The most useful change is to
`src/taxonomy.js`: it is wrong in ways only someone with a different network
can see. If your field comes out as "Other", that is the file to fix.

## Licence

MIT. See [LICENSE](LICENSE).

Network Constellation is not affiliated with or endorsed by LinkedIn.
