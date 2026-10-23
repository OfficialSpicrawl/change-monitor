---
name: spicrawl-change-monitor
description: "Use when the user wants to watch web pages for changes and get alerted (console, Discord or Slack), for example a pricing page, docs, a status page or a competitor site. Runs monitor.mjs, which scrapes each URL with the Spicrawl API and diffs it against the last snapshot."
---

# Spicrawl change monitor

`monitor.mjs` scrapes each URL to Markdown with the Spicrawl API, compares it with the snapshot from the last run, and prints a short diff when the page changed. It can also post the change to Discord and/or Slack.

## Setup

1. Needs Node >= 18 and a Spicrawl API key in `SPICRAWL_API_KEY` (free key at https://app.spicrawl.com, 1,000 credits/month). If the variable is not set, ask the user to export it. Do not ask them to paste the key into chat.
2. Run `npm install` once in this directory (the folder that holds `monitor.mjs`).
3. Optional alerts: `DISCORD_WEBHOOK_URL` and/or `SLACK_WEBHOOK_URL`. Only a `Changed` result is sent to them.

## Run

Run from this directory:

```sh
node monitor.mjs                          # check every URL in urls.txt once
node monitor.mjs https://a.com https://b.com   # check these URLs instead of urls.txt
node monitor.mjs -f my-urls.txt -s my-state.json   # other URL list / snapshot file
node monitor.mjs --every 1h               # keep running; 30s, 15m, 1h (s, m or h)
node monitor.mjs --help
```

- Add URLs to `urls.txt`: one per line, blank lines and lines starting with `#` are ignored. URLs given as arguments are used instead of the file.
- Snapshots are stored in `.monitor-state.json` (or the `-s` path). The first run only saves baselines, so run it once before expecting a change.
- To schedule without `--every`, run it once per tick from cron: `0 * * * * cd /path/to/change-monitor && node monitor.mjs >> monitor.log 2>&1` (set the env vars above the job).

## Read the output

- `Baseline saved: <url>`: first time this URL was seen. Not a change.
- `Unchanged: <url>`: same content as last run.
- `Changed: <url> (+N -M lines)` followed by `-` (removed) and `+` (added) lines, at most 20. This is the only status sent to Discord/Slack.
- `Blocked/unavailable: <url> (target returned HTTP NNN ...)`: the site answered 4xx/5xx. It costs 0 credits, the snapshot is left as it was, and it is not a change.
- `Error: <url> - ...`: that URL failed; the others still run. Exit code is 1 if any URL errored, the key was rejected or credits ran out. A blocked page is not an error.
- The last line, `Credits used this run: N`, tells you what the run cost.

Pages are fetched with `cache: false`, so every check is fresh. Show the user the `Changed` diffs, and tell them about any `Blocked` or `Error` URLs.

## Cost

A plain fetch scrape is 1 credit. The monitor uses `mode: "auto"`, which can escalate to JS rendering (3 credits) or a full browser (8) when a page needs it. Monthly cost is about URLs x checks per day x 30: 3 URLs every 6 hours is ~360 credits, every 15 minutes is ~8,600, far over the free 1,000. On the free plan keep the URL list short (a handful) and the interval long. Before starting `--every` or a cron job, tell the user the estimate.

## Guardrails

- Never print, log, echo or commit `SPICRAWL_API_KEY` or a webhook URL. Do not put them in files in a repo.
- `.monitor-state.json` holds the full text of every page; do not commit it if the pages are private.
- Only monitor pages the user is allowed to fetch and respect each site's terms of service and robots rules.
- Do not hammer a site: use an interval of 15 minutes or more (`--every 15m` at the least; hourly or slower is better).
- A blocked URL is final. Do not loop on it or try to get around the block.
