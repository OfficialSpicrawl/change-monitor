# Live demo (Cloudflare Worker)

A one-page demo of the change monitor, served at https://change-monitor.spicrawl.com. A visitor types a URL at the terminal prompt and presses **Run**. The Worker scrapes it with Spicrawl (the CLI's call, minus `mode: "auto"`: one plain fetch capped at 1 credit), keeps a snapshot in Workers KV, and answers `Baseline saved`, `Unchanged` or `Changed` with the line diff, plus the credits used. The page also plays a scripted sample run, shows the install command and the "Try Spicrawl free" link, and has a "Star on GitHub" button. The Worker asks the GitHub API for the star count (one call an hour, kept with the Cache API under a synthetic key) and writes it into the page; it is left out when it is 0 or the call fails.

```text
demo/
  wrangler.jsonc     Worker config, bindings and the static assets folder
  DESIGN.md          why the page looks the way it does (read before changing it)
  src/worker.mjs     GET / -> page, GET /llms.txt, POST /api/check -> JSON, anything else -> the 404 page
  src/page.mjs       the HTML and CSS (one string, inline CSS, no framework)
  client/            the page's script, bundled to public/app.js: the live check, the sample run, the effects
  public/            static assets: built files (git-ignored) plus robots.txt and sitemap.xml
  test/worker.test.mjs
scripts/demo-build.mjs   builds demo/public
```

`worker.mjs` imports `diffLines` straight from `../../monitor.mjs`. The CLI module bundles cleanly under `nodejs_compat` (its `node:fs` imports are never called in the Worker), so there is no second copy of the diff code.

## The page's script and assets

`npm run demo:build` (run by `demo:dev` and `demo:deploy`) writes `demo/public/`, which the Worker serves as [static assets](https://developers.cloudflare.com/workers/static-assets/) before it runs:

| File | From |
|---|---|
| `app.js` and `chunk-*.js` | `demo/client`, bundled with esbuild. The avatar library is its own chunk, loaded when the agent chat is near the viewport. |
| `fonts/Geist-Variable.woff2`, `fonts/GeistMono-Variable.woff2` | the `geist` package (SIL OFL 1.1), self-hosted so the page makes no third-party request |
| `fonts/Righteous-Latin.woff2` | the `@fontsource/righteous` package (SIL OFL 1.1), Latin subset, weight 400: the home page's H1 only |
| `spicrawl.svg`, `og.png` | `videos/public/brand/wordmark.svg`, `launch/social-preview.png` |
| `THIRD-PARTY.txt` | the licences of everything above that ships to the browser |

The effects come from two libraries.dev packages, `thinking-orbs` (the "Checking..." line) and `bot-avatars` (the agent chat), both React, plus [ascii.rest](https://ascii.rest) (MIT) for the pulse, the URL field's ghost and the decoding diff line. `demo/client/pieces/scramble.js` is a modified copy of its `scramble` piece, as ascii.rest allows. `border-beam` was tried on the install command and removed: it was barely visible and cost frames.

## Run it locally

```sh
npm install
printf 'SPICRAWL_API_KEY=spicrawl_live_...\n' > demo/.dev.vars   # git-ignored
npm run demo:dev                                                # http://localhost:8787
```

Local mode needs no Cloudflare login. KV, the rate limiter, the Cache API and the Analytics Engine binding are all simulated locally. Every check is a real scrape against your key. `demo:dev` builds `demo/public` first; after a change under `demo/client`, run `npm run demo:build` again. Wrangler reads the assets folder when it starts, so restart it after a new file appears there.

## Deploy

1. `npm install` (wrangler and the page's build dependencies are dev dependencies, pinned to exact versions; wrangler needs Node 22 or later).
2. Create the KV namespace and paste the printed `id` over `REPLACE_WITH_KV_ID` in `demo/wrangler.jsonc`:

   ```sh
   npx wrangler kv namespace create SNAPSHOTS --config demo/wrangler.jsonc
   ```

3. Set the Spicrawl key as a secret. Use the key of the org that should be billed for the demo, so its usage shows up on its own:

   ```sh
   npx wrangler secret put SPICRAWL_API_KEY --config demo/wrangler.jsonc
   ```

4. Optional: for Cloudflare Web Analytics, add a site in the dashboard (dashboard > Web Analytics) and put its token in `vars.BEACON_TOKEN`. While it is empty the page has no beacon.
5. Optional but recommended for a public demo: Cloudflare Turnstile (see [Turnstile](#turnstile)).
6. Deploy (this builds `demo/public` first):

   ```sh
   npm run demo:deploy
   ```

The route is a Workers Custom Domain, so `spicrawl.com` must be a zone on the account in `wrangler.jsonc`; Cloudflare creates the DNS record and certificate on the first deploy. `workers_dev` and preview URLs are off on purpose: the credit guard relies on the Cache API, which does nothing on `workers.dev`.

| Binding | Type | Notes |
|---|---|---|
| `SNAPSHOTS` | KV | key `sha256(url)`, value `{ hash, content, checkedAt }`, expires after 7 days |
| `LIMITER` | Rate limit | 5 checks per 60 s per `CF-Connecting-IP`; `namespace_id` is any unique number |
| `EVENTS` | Analytics Engine | dataset `spicrawl_demo_events`, created on the first write |
| `BEACON_TOKEN` | var | Web Analytics token, empty = off |
| `TURNSTILE_SITE_KEY` | var | Turnstile widget site key; Turnstile is on only when this and `TURNSTILE_SECRET` are both set |
| `TURNSTILE_SECRET` | secret | Turnstile secret key, used server-side only |
| `SPICRAWL_API_KEY` | secret | never returned or logged; Spicrawl error text is never returned, and log lines are scrubbed of the key |

## Guards

The demo spends the credits of a paid key for anyone on the internet, so every check goes through these, in this order:

- Rate limit: 5 checks per minute per visitor, `429` with `Retry-After: 60`. The key is `CF-Connecting-IP`; an IPv6 visitor is keyed on its /64 (the first four groups, with `::` expanded), because one IPv6 customer controls billions of addresses.
- Request body: `POST /api/check` accepts only `application/json`, and only with a numeric `Content-Length` of 4096 or less (`411` without one, `413` over it), so a chunked request cannot skip the size check. Other sites cannot make a visitor's browser spend credits with a plain form post either.
- URL: only `http` and `https`, 2048 characters at most; a bare `example.com` becomes `https://example.com/`. Rejected before any credit is spent: `localhost`, every IP-literal host (IPv4, IPv6 and the decimal or hex spellings of 127.0.0.1, which includes 127.x, 10.x, 172.16-31.x and 192.168.x), single-label names, `*.local`, `*.internal`, `*.localhost`, `*.localdomain`, `*.lan`, `*.home.arpa` (and `home.arpa` itself), and URLs with a username or password. Any number of trailing dots is stripped first, so `localhost..` is `localhost`.
- Turnstile (optional): when configured, the token is verified with Cloudflare before anything else costs money. See [Turnstile](#turnstile).
- Credit floor: before scraping, the Worker reads `GET /v1/usage/summary`. If `allowance.remaining_micro / 1e6` is below 100 (and the allowance is not unlimited) it refuses with "The demo has used its credits for this month" and the clone commands.
- Pace guard: from the same summary, the Worker works out how far through the allowance month it is (`window_start` to `resets_at`) and refuses with "Today's share of the demo's credits is used up" (outcome `paced`) when the credits used are more than the share of the monthly limit that time has earned plus 5% of the limit. That keeps one busy day from eating the whole month. The floor and the pace guard fail closed: a summary with a missing or unreadable number refuses instead of letting the check through. An unlimited allowance has nothing to pace against, so only the per-check cap below applies.
- The usage summary is cached for 60 seconds with the Cache API, under a synthetic key (`https://cache.internal/usage-summary`, never fetched), so most requests make no summary call. Only the numbers the guards need are cached.
- Per-check cost cap: the scrape is a plain fetch (no `mode: "auto"`) with `max_cost: 1`. Spicrawl checks that ceiling before it runs anything and refuses a dearer request at 0 credits, so a visitor cannot pick a challenge-protected site that escalates to a browser engine (up to 8 credits, with 25 credits reserved while it runs). Such a site, or one that refuses a plain fetch, gets the `Blocked/unavailable` answer that points at the CLI, which still escalates automatically.
- Only a target status of exactly `200` is stored or diffed. Anything else (403, 503, and also 202, 203, 206, which Spicrawl may bill at 0) is `Blocked/unavailable`, and nothing is written to KV.
- Errors: Spicrawl's own error text is never returned. A visitor sees a fixed sentence and, for Spicrawl errors, the error code, for example `Spicrawl could not accept that URL. Check that it is a public web page (ERR::SECURITY::SSRF_BLOCKED).`
- Headers: every response has `X-Content-Type-Options: nosniff`. The page's CSP has no `unsafe-inline`: the one inline style carries a per-response nonce (`crypto.randomUUID`), the script is the page's own `/app.js` (`script-src 'self'`), and the page is sent with `Cache-Control: no-cache` so a shared cache cannot replay it. It allows `static.cloudflareinsights.com` (the Web Analytics beacon) and nothing else off the origin; fonts are `'self'`. Turnstile adds `challenges.cloudflare.com` for scripts and frames only while it is on.
- No engine names: the answer to a check never carries which engine Spicrawl used, and the page never names one.

## Turnstile

Off by default. To turn it on:

1. In the Cloudflare dashboard open Turnstile and add a widget for `change-monitor.spicrawl.com` (managed mode is fine).
2. Put the **site key** in `vars.TURNSTILE_SITE_KEY` in `demo/wrangler.jsonc`.
3. Store the **secret key**: `npx wrangler secret put TURNSTILE_SECRET --config demo/wrangler.jsonc`.
4. `npm run demo:deploy`.

Turnstile is on only when both are set; with either missing the page has no widget and nothing is verified. While it is on, the page shows the widget above the Check button, the browser sends its token with each check, and the Worker verifies it against `https://challenges.cloudflare.com/turnstile/v0/siteverify` (with the visitor's address) after the URL has been validated and before the credit lookup or the scrape. A missing, rejected or expired token is a `403`; if the verification service cannot be reached the check is refused with a `503` rather than let through. Tokens work once, so the page resets the widget after every check.

## Things to know

- Snapshots are shared. Two visitors who check the same URL compare against each other's snapshot, and the stored page text can be seen as a diff by anyone. The page says so.
- Only the first 200 KB of a page is stored and compared.
- A snapshot is written to KV only when it is new or the page changed. A check that finds the page unchanged writes nothing (KV allows one write per second per key, and the Workers Free plan 1,000 writes a day), so a snapshot expires 7 days after the page last changed, not after the last check. If a write fails the visitor still gets the result; only the snapshot is lost. KV is eventually consistent, so a check from another location within about a minute can still see the older snapshot.
- Diffs are a set difference of lines, as in the CLI: moved lines are invisible.

## Analytics

Every `/api/check` call writes one data point:

| Field | Value |
|---|---|
| `blob1` | `change-monitor` |
| `blob2` | outcome: `baseline`, `unchanged`, `changed`, `blocked`, `error`, `rate_limited`, `no_credits`, `paced` or `invalid` |
| `blob3` | target host as parsed (also set when the URL was rejected) |
| `blob4` | visitor country from `request.cf.country` |
| `double1` | credits used |
| `double2` | duration in ms |
| `index1` | `change-monitor` |

Checks per outcome per day, through the [Analytics Engine SQL API](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/) (needs an API token with `Account Analytics: Read`):

```sh
curl "https://api.cloudflare.com/client/v4/accounts/036bd64d65479473f0effc8c4fb126ff/analytics_engine/sql" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  --data "SELECT
            toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day,
            blob2 AS outcome,
            SUM(_sample_interval) AS checks,
            SUM(double1 * _sample_interval) AS credits
          FROM spicrawl_demo_events
          WHERE index1 = 'change-monitor'
          GROUP BY day, outcome
          ORDER BY day DESC, checks DESC"
```

## Tests

```sh
npm test
```

`demo/test/worker.test.mjs` calls the fetch handler with a stubbed env (KV, rate limiter, Analytics Engine), a stubbed Cache API and a stubbed `fetch` for the Spicrawl API. It needs no network and no key.
