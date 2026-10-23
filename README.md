# change-monitor: website change detection for AI agents and humans

[![test](https://github.com/OfficialSpicrawl/change-monitor/actions/workflows/test.yml/badge.svg)](https://github.com/OfficialSpicrawl/change-monitor/actions/workflows/test.yml)
[Live demo](https://change-monitor.spicrawl.com) · [Demo video (MP4)](videos/out/change-monitor/v1/change-monitor.mp4) · Apache-2.0

![change-monitor demo](videos/out/change-monitor/v1/change-monitor.gif)

Open-source **website change detection** CLI: watch any web page, get a line diff when it changes, and send **Discord or Slack alerts**. Run it from cron or **GitHub Actions**, or install it as a **Claude Code / Codex agent skill** so your coding agent can monitor pages for you. **Web scraping** with JavaScript rendering and anti-bot handling comes from the Spicrawl API.

**Install as an agent skill** (Claude Code, Codex, Cursor and more): `npx skills add OfficialSpicrawl/change-monitor`, then run `npm install` in the installed folder. Or clone it and run it yourself:

Watches a list of URLs with the [Spicrawl](https://docs.spicrawl.com) API. Each run scrapes every page to Markdown, compares it with the last snapshot, and alerts when the content changed.

## Quickstart

Needs Node 18 or later.

```sh
git clone https://github.com/OfficialSpicrawl/change-monitor.git
cd change-monitor
npm install
export SPICRAWL_API_KEY=spicrawl_live_...   # free key, 1,000 credits/month: https://app.spicrawl.com
node monitor.mjs
```

The first run saves a baseline for each URL in `.monitor-state.json`. Run it again later and any change is printed as a short diff:

```text
[2026-10-23T11:13:00.601Z] Checking 3 URL(s)
Baseline saved: https://example.com
Baseline saved: https://www.iana.org/help/example-domains
Baseline saved: https://en.wikipedia.org/wiki/Main_Page
Credits used this run: 3

[2026-10-23T11:13:20.137Z] Checking 1 URL(s)
Changed: https://example.com (+1 -2 lines)
- This domain is for use in docs (old wording) examples without needing permission. ...
- An old line that was removed.
+ This domain is for use in documentation examples without needing permission. ...
Credits used this run: 1
```

(Real output. For the second run the stored snapshot was edited by hand to force a change.) A URL whose site answers 4xx/5xx is reported as `Blocked/unavailable` and its snapshot is left as it was.

## Options

```text
node monitor.mjs [options] [url ...]
```

| Option | Default | |
|---|---|---|
| `url ...` | | URLs to check. When given, `urls.txt` is not read. |
| `-f, --file <path>` | `urls.txt` | One URL per line. Lines starting with `#` and blank lines are ignored. |
| `-s, --state <path>` | `.monitor-state.json` | Where snapshots are kept. |
| `-e, --every <time>` | | Keep running and check again after this long: `30s`, `15m`, `1h`. Without it, run once and exit. |
| `-h, --help` | | Print usage. |

| Environment variable | |
|---|---|
| `SPICRAWL_API_KEY` | Required. |
| `DISCORD_WEBHOOK_URL` | Optional. A change is POSTed as `{ "content": ... }`. |
| `SLACK_WEBHOOK_URL` | Optional. A change is POSTed as `{ "text": ... }`. |

Every alert is also printed to the console. The exit code is 1 when the key is rejected, credits run out, or any URL failed with an error; a blocked page is reported but is not an error.

## What counts as a change

- The page is scraped with `response_format: "markdown"`, `main_content_only: true` and `mode: "auto"`, so navigation and footers are dropped and a JavaScript-heavy page is rendered only when a plain fetch is not enough. It is requested with `cache: false`, because the API may otherwise serve a stored copy and hide a change.
- A sha256 of the Markdown is compared with the one from the last run. The first time a URL is seen it is a baseline, not a change.
- If the target site answers with an HTTP status of 400 or higher (403, 429, 503 ...), Spicrawl still returns a successful response whose body is the block page. The monitor reports it as `Blocked/unavailable`, does not save it and does not call it a change, so the last good snapshot stays in place. Blocked pages are printed but not sent to Discord or Slack.
- The diff is a set difference of lines (removed lines, then added lines), cut to 20 lines. It does not show where in the page a line moved.

`.monitor-state.json` holds the full text of every page, so keep it out of public repos if the pages are private.

## Run it on a schedule

Run once per tick from cron:

```cron
SPICRAWL_API_KEY=spicrawl_live_...
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
0 * * * * cd /path/to/change-monitor && node monitor.mjs >> monitor.log 2>&1
```

Or use `--every 1h` under a process manager such as systemd or pm2.

### GitHub Actions

Put this folder in a repo of your own and add `.github/workflows/monitor.yml`. The workflow commits `.monitor-state.json` back so the next run has something to compare with. Add `SPICRAWL_API_KEY` (and optionally `DISCORD_WEBHOOK_URL` or `SLACK_WEBHOOK_URL`) as repository secrets.

```yaml
name: monitor
on:
  schedule:
    - cron: "0 */6 * * *"
  workflow_dispatch:
permissions:
  contents: write
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: node monitor.mjs
        env:
          SPICRAWL_API_KEY: ${{ secrets.SPICRAWL_API_KEY }}
          DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
      - name: Commit state
        if: always()
        run: |
          git config user.name "github-actions"
          git config user.email "github-actions@users.noreply.github.com"
          git add .monitor-state.json
          if ! git diff --cached --quiet; then
            git commit -m "Update monitor state"
            git push
          fi
```

## Credits

A plain fetch scrape costs 1 credit and a failed request costs 0. With `mode: "auto"` a page that needs JavaScript rendering costs more (3 credits with `js_render`, 8 with a full browser), and only the step that worked is billed. See [Credits](https://docs.spicrawl.com/credits).

Each run prints the credits it used. A rough monthly bill is `URLs x checks per day x 30` credits: 3 URLs every 6 hours is about 360, but 3 URLs every 15 minutes is about 8,600, far over the free 1,000.

## Tests

```sh
npm test
```

The tests pass a stubbed `fetch` to the Spicrawl client, so they need no network and no API key. They cover the baseline, an unchanged page, a changed page with its diff, and a target 403.

## Use it from Claude Code or Codex

This folder includes a `SKILL.md` (the Agent Skills format) that tells an AI coding agent how to run the monitor. Copy this folder to `~/.claude/skills/spicrawl-change-monitor/` (Claude Code) or to `.agents/skills/spicrawl-change-monitor/` in a repo (Codex and other agents), and run `npm install` in it.

Make sure `SPICRAWL_API_KEY` is set in the shell the agent runs in, then ask for it in plain words, for example: "watch these three pages and ping Discord when they change".
