# Install and self-host

Network Constellation is a static page: an HTML file, a stylesheet and some
JavaScript modules. There is no server to run, no database and no build step.
Nothing needs installing to *use* it, and to host it yourself you only need a
place that serves static files.

- [What you need](#what-you-need)
- [Three ways to run it](#three-ways-to-run-it)
- [Put your own copy on GitHub Pages](#put-your-own-copy-on-github-pages)
- [Other static hosts](#other-static-hosts)
- [Keeping it up to date](#keeping-it-up-to-date)
- [Troubleshooting](#troubleshooting)

## What you need

**To use it:** a browser with WebGL and hardware acceleration switched on. Any
recent Chrome, Edge, Firefox or Safari will do, on a desktop or a phone.

**To run it on your own machine or host it:** [Node.js](https://nodejs.org) 18
or newer, and git. Node is only used as a task runner and a small development
server. The project has **no dependencies**, so there is no `npm install` step.

**Optional:** an [Anthropic API key](https://console.anthropic.com/settings/keys)
to look up where employers are based, read questions more closely and research
a person. Everything else works without one.

## Three ways to run it

### 1. The hosted page

Open **<https://asturksever.github.io/network-constellation/>**, and either try
the demo or drop your `Connections.csv` on it.

The page is served by GitHub Pages, but your file never goes there. It is read
in your browser tab and kept in that browser's own storage. Without a key, the
only other request the page makes is for the 3D library, from
`cdn.jsdelivr.net`.

### 2. On your own machine

```bash
git clone https://github.com/asturksever/network-constellation.git
cd network-constellation
npm run dev
```

Then open <http://localhost:8080>. The development server sends
`Cache-Control: no-store`, so every reload picks up your edits.

Opening `index.html` by double-clicking it does **not** work. Browsers won't
load JavaScript modules from `file://`, so use `npm run dev`, or the single-file
build below.

Useful extras, none of them required:

| Command | What it does |
|---|---|
| `npm run data` | Builds `data/graph-data.json` from `data/Connections.csv`. On localhost the page then opens it directly instead of the landing page, unless a graph is already kept in that browser (that one comes first; **Forget** clears it). |
| `npm run logos` | Fetches employer logos into `logos/`. This sends domain guesses made from employer names to unavatar.io, DuckDuckGo and Google. Company names only, never people's. |
| `npm run vendor` | Keeps a copy of the 3D library in `vendor/`, so the page works on localhost with no internet connection. |
| `npm run pages` | Serves the site on <http://localhost:8090> exactly as GitHub Pages will: `data/`, `logos/`, `dist/` and `vendor/` answer 404. |
| `npm test` | Runs the tests (`node:test`, no framework). |

`data/`, `logos/`, `dist/` and `vendor/` are gitignored as whole directories, so
nothing you put there can be committed by accident.

### 3. As a single file

```bash
npm run bundle:demo    # dist/network-constellation-demo.html
```

This flattens the whole tool into one HTML file of about 0.3 MB, demo included.
Double-click it to open it, attach it to an email, or put it on a USB stick. It
contains nothing of yours, so it is safe to share. It still needs an internet
connection for the 3D library, and for Anthropic if you add a key.

```bash
npm run bundle         # dist/network-constellation.html
```

This does the same with **your** graph and logos baked in, so it opens straight
into your network. It holds every name in your export. **Treat it like the
export itself:** it is for you, and should never be published.

## Put your own copy on GitHub Pages

You don't need to do this to use the tool. The hosted page works for anyone.
Host your own copy if you want to change it, or pin a version.

1. **Fork the repository** on GitHub (**Fork**, top right), or push a clone to
   a new repository of your own. Don't add a `data/` folder; it is gitignored
   for a reason.
2. In your repository, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
   Set **Branch** to `main` and the folder to `/ (root)`, then **Save**.
4. Wait a minute. The **Actions** tab shows a *pages build and deployment* run.
   When it is green, your copy is live at
   `https://<your-username>.github.io/<repository-name>/`.
5. Open it and check that the demo turns behind the landing page.

A `.nojekyll` file is already committed, so GitHub serves the files exactly as
they are, with no Jekyll processing.

**A custom domain:** add it under **Settings → Pages → Custom domain**, and
follow GitHub's DNS instructions.

**If you change what the page connects to:** `index.html` sets a
Content-Security-Policy. It allows scripts only from the page itself and
`cdn.jsdelivr.net`, and network requests only to the page itself and
`api.anthropic.com`. If you add a service, add it there too, or the browser
will block it. That is the point of the policy.

## Other static hosts

Any static host works: Netlify, Cloudflare Pages, Vercel, an S3 bucket, or
nginx. Serve the repository root, with no build command and no output
directory. The only requirement is that `.js` files are served with a
JavaScript MIME type, which every mainstream host does by default.

## Keeping it up to date

```bash
git pull
```

With no dependencies there is nothing else to update. On a fork, press **Sync
fork** on GitHub, and Pages redeploys by itself.

Your graph lives in your browser, not in the code, so updating never touches
it.

## Troubleshooting

**"Another tab of this page is holding the browser database."**
Another tab has this page open with an older version of its storage. Close the
other tabs of the page and reload. **Forget** reports the same thing, and the
erase finishes by itself once the other tab is closed.

**"This browser could not open a 3D canvas."**
WebGL is unavailable. Turn hardware acceleration on:
- Chrome and Edge: **Settings → System → Use graphics acceleration when available**.
- Firefox: **Settings → Performance**.

Then restart the browser. `chrome://gpu` shows what Chrome thinks of your
graphics driver. On some older machines, a different browser works where one
does not.

**"The graph library could not be loaded", or a blank page.**
The 3D library comes from `cdn.jsdelivr.net`. You may be offline, behind a
proxy that blocks it, or running a content blocker. Allow that domain, or run
it locally after `npm run vendor`.

**My graph is gone after a week (Safari).**
Safari clears a site's storage after seven days without a visit, and private
windows in every browser throw it away when they close. Drop the file in again;
it takes seconds. Employer lookups and research briefs are kept in the same
place, so they go with it and would be paid for again.

**"That API key was rejected."**
Check that you copied the whole key (it starts with `sk-ant-`), that it hasn't
been revoked, and that its organisation has credit. Keys are managed at
[console.anthropic.com](https://console.anthropic.com/settings/keys).

**"Web search is switched off for this key's organisation."**
**Enrich profile** uses Claude's web search tool, which an organisation admin
can switch off. An admin can switch it back on in the Claude Console, under
**Settings → Privacy**. Everything else works without it.

**"Could not reach api.anthropic.com from this page."**
The request never completed. You may be offline, a proxy or firewall may be
blocking it, or a browser extension may be refusing the request.

**"This file is not UTF-8, so it was read as Windows-1252."**
It was probably saved by Excel. Check that accented names look right in the
first row shown. If they don't, open the file in Excel and save it again as
**CSV UTF-8**.

**"That is an Excel workbook", or "That is LinkedIn's whole download".**
Save the workbook as CSV, or unzip the download and drop `Connections.csv`
from inside it.

**"Could not tell which column is which."**
Your CSV names its columns differently. Pick them in the mapper. It needs a
name (or a first and last name), plus either a headline or a job title.

**Most people land in "Other".**
Their field isn't in the taxonomy yet. It is a list of patterns in
`src/taxonomy.js`, and adding your field there is the most useful contribution
anyone can make. See [CONTRIBUTING.md](../CONTRIBUTING.md).

---

Next: [Your first session](tutorial.md) · [How questions are answered](ask-your-graph.md) · [Back to the README](../README.md)
