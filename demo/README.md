# Live demo (Cloudflare Worker)

A one-page demo of the change monitor, served at https://change-monitor.spicrawl.com. A visitor pastes a URL and clicks **Check**. The Worker scrapes it with Spicrawl (the same call as `monitor.mjs`), keeps a snapshot in Workers KV, and shows `Baseline saved`, `Unchanged` or `Changed` with the line diff, plus the credits used and the engine.

```text
demo/
  wrangler.jsonc     Worker config and bindings
  src/worker.mjs     GET / -> page, POST /api/check -> JSON
  src/page.mjs       the HTML page (inline CSS and JS, no build step)
  test/worker.test.mjs
```

`worker.mjs` imports `diffLines` straight from `../../monitor.mjs`. The CLI module bundles cleanly under `nodejs_compat` (its `node:fs` imports are never called in the Worker), so there is no second copy of the diff code.

## Run it locally

```sh
npm install
printf 'SPICRAWL_API_KEY=spicrawl_live_...\n' > demo/.dev.vars   # git-ignored
npm run demo:dev                                                # http://localhost:8787
```

Local mode needs no Cloudflare login. KV, the rate limiter, the Cache API and the Analytics Engine binding are all simulated locally. Every check is a real scrape against your key.

## Deploy

1. `npm install` (wrangler is a dev dependency, pinned to an exact 4.x version; it needs Node 22 or later).
2. Create the KV namespace and paste the printed `id` over `REPLACE_WITH_KV_ID` in `demo/wrangler.jsonc`:

   ```sh
   npx wrangler kv namespace create SNAPSHOTS --config demo/wrangler.jsonc
   ```

3. Set the Spicrawl key as a secret. Use the key of the org that should be billed for the demo, so its usage shows up on its own:

   ```sh
   npx wrangler secret put SPICRAWL_API_KEY --config demo/wrangler.jsonc
   ```

4. Optional: for Cloudflare Web Analytics, add a site in the dashboard (dashboard > Web Analytics) and put its token in `vars.BEACON_TOKEN`. While it is empty the page has no beacon.
5. Deploy:

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
| `SPICRAWL_API_KEY` | secret | never returned or logged; error text is scrubbed of it |

## Guards

- Only `http` and `https` URLs, 2048 characters at most. A bare `example.com` becomes `https://example.com/`.
- Rejected before any credit is spent: `localhost`, every IP-literal host (IPv4, IPv6 and the decimal or hex spellings of 127.0.0.1, which includes 127.x, 10.x, 172.16-31.x and 192.168.x), single-label names, `*.local`, `*.internal`, `*.localhost`, `*.localdomain`, `*.lan`, and URLs with a username or password.
- Rate limit: 429 with `Retry-After: 60`.
- Credit guard: before scraping, the Worker reads `GET /v1/usage/summary`. If `allowance.remaining_micro / 1e6` is below 100 (and the allowance is not unlimited) it refuses with "The demo has used its credits for this month" and the clone commands. The derived number is cached for 60 seconds with the Cache API, so most requests make no summary call.
- `POST /api/check` accepts only `application/json`, so another site cannot make a visitor's browser spend the demo's credits with a plain form post.
- A target status of 400 or more is `Blocked/unavailable`: nothing is written to KV.

## Things to know

- Snapshots are shared. Two visitors who check the same URL compare against each other's snapshot, and the stored page text can be seen as a diff by anyone. The page says so.
- Only the first 200 KB of a page is stored and compared.
- Each check that is not blocked writes to KV (this refreshes the 7-day expiry). The Workers Free plan allows 1,000 KV writes per day. KV is eventually consistent, so a check from another location within about a minute can still see the older snapshot.
- Diffs are a set difference of lines, as in the CLI: moved lines are invisible.

## Analytics

Every `/api/check` call writes one data point:

| Field | Value |
|---|---|
| `blob1` | `change-monitor` |
| `blob2` | outcome: `baseline`, `unchanged`, `changed`, `blocked`, `error`, `rate_limited`, `no_credits` or `invalid` |
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
