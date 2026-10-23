# Reddit

Subreddit: r/webscraping. Read the sidebar first: if tool posts are restricted to a monthly promotion thread, post it there instead. Do not post this within 4 days of the price-tracker post in the same sub (see LAUNCH-PLAN.md); if r/webscraping removed that one, use r/ClaudeAI with the SKILL.md angle (ask Claude to watch pages) instead.

Repo: https://github.com/OfficialSpicrawl/change-monitor
Demo: https://change-monitor.spicrawl.com

## Title

```
Small CLI to detect page changes between runs (handles block pages without false alerts)
```

## Body

```
I wrote a small Node CLI that watches a list of URLs and prints a line diff when a page's content changed since the last run, with optional Discord/Slack alerts. It is meant to run from cron or a scheduled GitHub Action.

A few details from building it:

- Each page is fetched as Markdown with navigation and footers dropped, so the cookie banner and menu do not count as changes.
- cache:false on every request. The API I use (Spicrawl, I work on it) otherwise reuses stored results for up to 48 hours, which hides changes.
- A hash of the Markdown is compared with the last run. If the site answers 403/503, the response body is a block page, so it is reported as "Blocked/unavailable", not saved, and not called a change. Otherwise the first 403 would fire an alert and overwrite your good snapshot.

Limits: the diff is a set of removed/added lines capped at 20, so a moved line is invisible. Snapshots are a local JSON file with the full page text. It watches only the URLs you list, no crawling or search. 1 credit per URL per check; free key is 1,000 credits a month, failed requests cost 0, so 3 URLs every 6 hours is about 360 a month.

Repo: https://github.com/OfficialSpicrawl/change-monitor
Try one URL in the browser: https://change-monitor.spicrawl.com
Short demo video in the repo under videos/out.

How do you handle pages where a timestamp or a rotating banner changes every load? There is no ignore rule yet; main_content_only drops some of that noise, not all of it.
```
