/*
 * Pull your own follower list out of LinkedIn.
 *
 * HOW TO RUN
 *   1. Log in to LinkedIn in a normal browser tab.
 *   2. Open https://www.linkedin.com/mynetwork/network-manager/people-follow/followers/
 *   3. Open DevTools -> Console, paste this whole file, press Enter.
 *   4. Wait. It prints progress and downloads a CSV when it finishes.
 *   5. Move the CSV to data/followers.csv and run `npm run data`.
 *
 * WHAT IT IS
 *   This calls LinkedIn's own internal Voyager endpoint — the same one the page
 *   itself uses — with your existing session cookie. It is not a public API and
 *   it is not documented, so it can change or disappear without warning. If the
 *   pull returns nothing, open the network tab on that page, click "Show more
 *   results", and copy the new queryId over the one below.
 *
 *   It reads only your own follower list, one page at a time, with a pause
 *   between pages. Don't tighten the delay.
 */
(async () => {
  const QUERY_ID = 'voyagerSearchDashClusters.a7a0567fa66c52d645b5ff2f960b92aa';
  const PAGE = 100;
  const MAX = 20000;
  const DELAY_MS = 220;

  const csrf = document.cookie.match(/JSESSIONID="?([^";]+)"?/)?.[1];
  if (!csrf) return console.error('No LinkedIn session found. Are you logged in on this tab?');

  const headers = {
    'csrf-token': csrf,
    accept: 'application/vnd.linkedin.normalized+json+2.1',
    'x-restli-protocol-version': '2.0.0'
  };

  const seen = new Set();
  const out = [];

  const page = async start => {
    const vars = `(start:${start},count:${PAGE},origin:CurationHub,` +
      `query:(flagshipSearchIntent:MYNETWORK_CURATION_HUB,includeFiltersInResponse:true,` +
      `queryParameters:List((key:resultType,value:List(FOLLOWERS)))))`;
    const res = await fetch(
      `https://www.linkedin.com/voyager/api/graphql?variables=${vars}&queryId=${QUERY_ID}`,
      { headers, credentials: 'include' }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    let added = 0;
    for (const x of json.included || []) {
      if (!x.$type?.endsWith('EntityResultViewModel')) continue;
      if (!x.title?.text) continue;
      if (seen.has(x.entityUrn)) continue;
      seen.add(x.entityUrn);
      const slug = String(x.navigationUrl || '').match(/linkedin\.com\/in\/([^/?#]+)/)?.[1] || '';
      out.push({
        name: x.title.text,
        headline: x.primarySubtitle?.text || '',
        url: slug ? `https://www.linkedin.com/in/${slug}/` : ''
      });
      added++;
    }
    return added;
  };

  console.log('Pulling…');
  for (let start = 0; start < MAX; start += PAGE) {
    let added = 0;
    try { added = await page(start); }
    catch (e) { console.warn('page ' + start + ' failed: ' + e.message); }
    if (start % 1000 === 0) console.log(`  ${start} → ${out.length} collected`);
    if (added === 0 && start > 0) break; // ran off the end
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const csv = '﻿' + ['Name', 'Headline', 'Profile URL'].map(q).join(',') + '\r\n' +
    out.map(r => [r.name, r.headline, r.url].map(q).join(',')).join('\r\n');

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `linkedin-followers-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);

  console.log(`Done — ${out.length} followers written to ${a.download}`);
})();
