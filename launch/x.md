# X

Repo: https://github.com/OfficialSpicrawl/change-monitor
Demo: https://change-monitor.spicrawl.com
Attach the demo video (videos/out, MP4) to post 1 as native video. Upload the file; do not link it.

## Single post

```
change-monitor: a small Node CLI that watches URLs and prints a line diff when a page changes. Optional Discord or Slack alert. 1 credit per URL per check.

https://github.com/OfficialSpicrawl/change-monitor
Demo: https://change-monitor.spicrawl.com
```

## Thread (replies to the single post)

```
1/ Run it once and it saves a baseline per URL. Run it again later:

Changed: https://example.com (+1 -2 lines)
- old line
+ new line

Real output is in the README. Run it from cron, or keep it running with --every 1h.
```

```
2/ Pages are fetched as Markdown with nav and footers dropped, cache:false so you never compare against a stored copy. If a site answers 403/503 it says "Blocked/unavailable" and keeps your last good snapshot instead of calling the block page a change.
```

```
3/ Limits: the diff is removed and added lines, cut to 20, so a moved line is invisible. Free plan: 1,000 credits a month, failed requests cost 0. 3 URLs every 6 hours is ~360 a month.

demo video: https://github.com/OfficialSpicrawl/change-monitor/tree/main/videos/out
```
