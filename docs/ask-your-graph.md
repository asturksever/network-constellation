# Ask your graph

*Design note. Prototype in `src/ask.js`, benchmarked against 10,144 real records.*

A question in, a shortlist of people out. "Who do I know in satellite imagery
licensing sales" should return the five people worth emailing, not a search box.

## The claim

**The model writes the query. It never reads the corpus.**

```
question → structured filter → run locally over classified rows → ~20 survivors → (optional) LLM ranks and explains
```

The obvious alternative — hand 10,000 headlines to a model per question — costs
about a million tokens a query, takes seconds, and can't run in a browser. The
filter approach is two small calls at most, and the retrieval step measured
**140 ms for seven questions over 10,144 people** in Node with no model involved.

## Why it works without an API key

`taxonomy.js` turns out to be **bidirectional**. The regex that recognises
"Satellite Image Sales and Marketing Manager" in a headline also recognises
"satellite imagery licensing sales" in a question. Same vocabulary, both
directions. Tested cold on five questions, it resolved every one to the right
domains with no model:

| Question | Resolved to |
|---|---|
| who do I know in satellite imagery licensing sales | Earth Observation & RS + Sales, BD & Marketing |
| anyone doing drone lidar surveying | Surveying, Drone & LiDAR |
| founders working on climate | Climate & Environment |
| professors researching urban mobility | Urban Planning & Mobility + Academia & Research |
| who works on autonomous vehicles | AV, Automotive & Fleet |

This matters more than it looks. An open-source tool cannot assume an API key.
Making the default path model-free means the feature works for everyone on first
run, and **degrades upward** with a key rather than being broken without one.

## Two bugs the prototype found

Both were invisible until it ran on real data.

**1. Domains were OR-ed when the question meant AND.** "Satellite imagery
licensing sales" names a *subject* (Earth Observation) and a *function* (sales).
OR-ing them returned 374 people — the right person correctly at the top, then four
generic sales directors with no connection to satellites. Splitting the taxonomy
into `FUNCTION_DOMAINS` and everything else, and intersecting the two axes, cut
it to **24** and put a satellite-image sales and marketing manager in first place.

**2. Common words drowned distinctive ones.** "Sales" appears in hundreds of
headlines and "satellite" in a handful, but both scored the same. Weighting free
terms by inverse document frequency over the corpus fixed the ordering. IDF is
computed once per dataset and costs nothing.

## Measured, after both fixes

| Question | Matched | Top hit (described, not named) |
|---|---|---|
| satellite imagery licensing sales | 24 | a satellite-image sales and marketing manager |
| sell dashcam footage to a mapping company | 2 | a senior executive at a dashcam maker |
| founders working on climate | 43 | a climate start-up's co-founder and CEO |
| professors researching urban mobility | 496 | a senior lecturer in urban mobility |
| government working on transport policy | 104 | a government-affairs lead in tech policy |

The wide ones are honestly wide: 496 people in a 10k geospatial network plausibly
research urban mobility. Precision at the top is what matters, and that holds.

## Show the query. Always.

Every result carries the filter in words:

> *works on Earth Observation & RS · in Sales, BD & Marketing · sells or does BD ·
> mentions satellite, imagery, licensing*

This is not a debug affordance, it is the trust mechanism. The user **knows these
people**. A wrong shortlist is obvious to them in a way a wrong web search never
is, and a black box that is wrong once gets closed forever. Showing the query
turns a wrong answer into a correctable one.

## Where the LLM does belong

Three jobs, all optional, all on ~20 rows rather than 10,000:

1. **Phrasings the taxonomy misses** — "someone who can get me into a government
   procurement process". Falls back to the regex path when no key is present.
2. **Reason lines** — one sentence per shortlisted person on why they fit.
3. **Question repair** — "did you mean people who *sell to* government, or people
   who *work in* government?"

None of these are load-bearing. All of them make it feel finished.

## Open questions

- **Payload — settled, by moving the build.** This used to be the blocking
  question: `ask.js` scores against role + company + headline, and
  `graph-data.json` dropped the headline to stay at 1.1 MB, so the browser
  would have scored on a third of the evidence. Four options were measured,
  from shipping raw headlines (+749 KB) to a build-time inverted index
  (+255 KB). None of them was needed. The classifier now runs in the browser on
  the dropped CSV, so the rich objects are already in memory and nothing has to
  be serialised at all. The one case that still ships text is the single-file
  bundle, which carries only the three fields the compact tuples lack.
- **Location and company type — added, with a caveat attached.** Neither exists
  in a LinkedIn export, so they come from an optional pass that sends employer
  names to Claude. Location is therefore an employer's headquarters and not a
  person's home, which the UI states on every answer that uses it, and the
  filter reports how many people it excluded for an employer it could not place.
  What comes back is inference, so each record carries a confidence.
- **Recall on the narrow ones.** Two matches for the dashcam question is precise
  but thin. Worth testing whether taxonomy-driven synonym expansion (walk the
  matched domain's own regex for sibling terms) recovers more without the noise.
- **Relationship strength is still absent.** The shortlist ranks by *fit*, never
  by *whether you actually know them*. On the official-export path `Connected On`
  gives a recency prior — already wired in behind `opts.now` — but that is a weak
  proxy and should not be dressed up as more.
