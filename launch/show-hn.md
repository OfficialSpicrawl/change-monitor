# Show HN

Repo: https://github.com/OfficialSpicrawl/change-monitor
Demo: https://change-monitor.spicrawl.com

## Title

```
Show HN: change-monitor, a CLI that diffs web pages between runs
```

URL field: https://github.com/OfficialSpicrawl/change-monitor

## First comment (post it right after submitting)

```
Hi HN, I'm the maker. change-monitor is one Node file (monitor.mjs) that checks a list of URLs, saves each page as Markdown, and on the next run prints a short line diff for every page that changed. The first run only saves baselines. Alerts go to the console and, if you set a webhook, to Discord or Slack. Run it once per cron tick, or with --every 1h. The browser demo (https://change-monitor.spicrawl.com) lets you save a baseline and check again without installing anything, and there is a short demo video in the repo (videos/out).

How it works: I work on Spicrawl, the scraping API it calls. Each page is requested as Markdown with main_content_only (navigation and footers dropped), mode "auto" (plain fetch first, JavaScript rendering only if needed) and cache:false, since the API would otherwise reuse a stored copy for up to 48 hours and hide a change. The tool compares a sha256 of the Markdown with the last run's. If the target answers 4xx/5xx, Spicrawl still returns a normal response containing the block page; the monitor reports "Blocked/unavailable", does not save it and does not call it a change.

Limits: the diff is a set difference of lines (removed, then added), cut to 20 lines, so it cannot show that a line moved. State is a local JSON file holding the full text of every page, so keep it out of public repos if the pages are private. A check is 1 credit per URL for a plain fetch (3 with JS rendering), the free plan is 1,000 credits a month, and failed requests cost 0; 3 URLs every 6 hours is about 360 credits a month, every 15 minutes is about 8,600. Spicrawl has no crawl, search or AI extraction yet, so it watches the exact URLs you list and does no summarizing. Repo: https://github.com/OfficialSpicrawl/change-monitor
```
