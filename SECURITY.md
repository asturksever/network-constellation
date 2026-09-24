# Security and privacy

Network Constellation runs entirely in the browser. There is no backend: the
things worth reporting are ways the page could leak what it holds — a person's
data from an export, a stored graph, or an Anthropic API key — or send anything
the README's [Privacy section](README.md#privacy) does not list.

Examples that matter:

- Anything that sends data to a destination other than `api.anthropic.com`, or
  sends to it something not listed (emails, profile links, a name without the
  **Enrich profile** click).
- A way for a crafted CSV to run script in the page (HTML injection through a
  name, headline or column header).
- A way around the Content-Security-Policy in `index.html`.
- The API key reaching a URL, a log, storage without **Remember**, or the repo.

## Reporting

Please report privately, not in a public issue: use **Security → Report a
vulnerability** on this repository. Include the browser, what you did, and
what left the page — reproduced with the demo's invented people, never real
data.

You can expect an acknowledgement within a week. Fixes are released as soon as
they are ready, and credited if you'd like.
