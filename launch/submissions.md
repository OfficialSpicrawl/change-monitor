# change-monitor: where to submit (researched 2026-10-23, nothing posted)

Rules were read from each list's CONTRIBUTING and star counts from the GitHub API today. Ordered by expected traffic / effort. Gate = what must be true before you submit.

Before any of them: (1) `https://change-monitor.spicrawl.com` does not resolve yet, so deploy first (lists check links). (2) Tag v0.1.0. `package.json` is `"private": true`, so there is no npm page; every list below links the GitHub repo. (3) Submit by hand as DibbayajyotiRoy, not the suspended Spicrawl account, and say you maintain the tool. Several lists ban agent-opened PRs/issues, so this file is drafts only. (4) Skill lists mostly target Claude Code users; this is a generic web tool with a skill, so docs2skill should go first and this one 2-3 days later.

| # | Target | Size | Gate / rule | Effort |
|---|---|---|---|---|
| 1 | skills.sh and SkillsMP | vercel-labs/skills 36k | No submission. skills.sh ranks by anonymous `npx skills add` installs; SkillsMP auto-indexes public SKILL.md (a third-party review says 2-star minimum, unverified). Put `npx skills add OfficialSpicrawl/change-monitor` in the README; test on a clean machine, since the skill needs `npm install` afterwards | 5 min |
| 2 | [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | 36.2k, merges daily | PR. "No brand-new skills; community-adopted". Recent merges were repos with 11-791 stars; API-backed skills are listed. Wait for about 50 stars (my estimate) | 5 min |
| 3 | [heilcheng/awesome-agent-skills](https://github.com/heilcheng/awesome-agent-skills) | 6.3k, weekly triage | At least 20 stars, repo over 14 days old, root SKILL.md with name+description, one appended line, disclose AI help. "SaaS sign-up pages" are refused; say it is OSS with a free key | 5 min |
| 4 | Console.dev | newsletter | Email hello@console.dev. 2-3 dev tools a week; pre-1.0 counts as a "beta" listing; CLI and self-serve try-out are plus points | 10 min |
| 5 | Anthropic plugin directory (feeds [claude-plugins-community](https://github.com/anthropics/claude-plugins-community)) | 4.8k mirror | claude.ai/directory/manage, Submit new, Plugin bundle. Needs `.claude-plugin/plugin.json` (none yet), `claude plugin validate`, security scan, data-handling answers. `name` is an immutable slug. Best as one `spicrawl-skills` bundle for all three tools | 1-2 h |
| 6 | DevHunt | - | Free listing (nofollow); $19 for a chosen launch week with a dofollow link. GitHub login | 15 min |
| 7 | AlternativeTo | - | Free account, "Suggest new application", moderated queue (third-party: slow, $5 priority option). Targets searches like "Visualping / changedetection.io alternative". Rules not verified from here | 15 min |
| 8 | [milisp/awesome-codex-cli](https://github.com/milisp/awesome-codex-cli) | 124, active | Issue form (PRs disabled). 100 stars, or 14 days plus two quality points. Signup-needed tools count only with outside signals | 10 min |
| 9 | [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) | 56.3k | Web form only, human only, one open recommendation at a time, 14 days of commits or 100 stars. Must be "specific to Claude Code": weak fit, file it after docs2skill's is decided | 10 min |
| 10 | [sickn33/agentic-awesome-skills](https://github.com/sickn33/agentic-awesome-skills) | 48.4k | PR adding `skills/<name>/SKILL.md`, `npm run validate`, upstream link in the PR. Outside PRs merge within a day | 30 min |

## Paste: #2 VoltAgent (end of Community Skills > Productivity and Collaboration; description is capped at 10 words)

```markdown
- **[OfficialSpicrawl/change-monitor](https://github.com/OfficialSpicrawl/change-monitor)** - Website change detection with line diffs and Discord/Slack alerts
```
Title: `Add skill: OfficialSpicrawl/change-monitor`. Body: `Root SKILL.md, README, Apache-2.0. Needs a free Spicrawl API key. I am the author.`

## Paste: #3 heilcheng (end of Community Skills > Integration and Automation, inside its `<details>`; do not edit anything else)

```markdown
- [OfficialSpicrawl/change-monitor](https://github.com/OfficialSpicrawl/change-monitor) - Watch pages, get line diffs and Discord/Slack alerts; free Spicrawl key needed
```
Title: `Add OfficialSpicrawl/change-monitor to Integration and Automation`. Fill their checklist honestly (author: yes; AI-assisted: say so if true).

## Paste: #4 Console.dev email

Subject: `change-monitor: website change detection with diffs and Discord/Slack alerts (open source, v0.1)`
```
Hi, I maintain change-monitor, an Apache-2.0 Node CLI: list URLs in a file, run it from cron or GitHub Actions, and it prints a line diff when a page's content changed and posts it to Discord or Slack. Pages that answer 4xx/5xx are reported as blocked and never overwrite the last good snapshot. It also ships as a Claude Code / Codex skill. It runs on the Spicrawl scraping API (I work on it); a free key gives 1,000 credits/month, about one credit per check. v0.1, so early. Repo: https://github.com/OfficialSpicrawl/change-monitor  Demo: https://change-monitor.spicrawl.com
```

## Paste: #6 DevHunt, #7 AlternativeTo, #5 directory form

Tagline (57 chars): `Page change detection with diffs and Discord/Slack alerts`
Description (212 chars): `Open-source CLI that watches web pages, shows a line diff when content changes and posts to Discord or Slack. Runs from cron or GitHub Actions, or as a Claude Code / Codex skill. Uses the Spicrawl API (free key).`
AlternativeTo: name `change-monitor`, license Apache-2.0 (open source), platforms Linux/macOS/Windows (Node 18+) and GitHub Actions, alternative to Visualping, changedetection.io, Distill. Use the description above.
Directory data handling: sends the watched URLs to api.spicrawl.com with the user's own `SPICRAWL_API_KEY`; posts a change summary to a Discord/Slack webhook only if the user sets one; stores snapshots in a local `.monitor-state.json`; no telemetry. [Fill in: Spicrawl's retention period.]

## Paste: #8 awesome-codex-cli and #9 awesome-claude-code forms (rewrite in your own words for #9; it requires a human-made recommendation)

Display Name `change-monitor`; Link `https://github.com/OfficialSpicrawl/change-monitor`; Author `OfficialSpicrawl`, `https://github.com/OfficialSpicrawl`. #8 section `Agent Skills > Domain-Specific`; #9 category `Multi-Purpose`.
Description: `Node CLI and agent skill that scrapes a list of URLs to Markdown, compares each with the last snapshot and prints a line diff, optionally posting to Discord or Slack. Runs from cron or GitHub Actions. Fetching goes through the Spicrawl API, which needs a free API key.`

## Will not accept it (do not submit)

- awesome-selfhosted (329k): needs self-hostable software with no dependence on a proprietary SaaS, and it bans LLM-written submissions. I drafted nothing. (changedetection.io is the self-hosted answer here, not this tool.)
- lorien/awesome-web-scraping (8.2k): excludes remote APIs and anything about AI agents or MCP, and repos under a month old.
- travisvn/awesome-claude-skills (15.5k): "SaaS wrappers" refused, 10-star minimum, AI-assisted PRs closed unread.
- ComposioHQ/awesome-claude-skills (77.7k): 1,704 open PRs, none merged since 2026-08-01. Skip.
- awesome-cli-apps (20.6k): needs 3 months of age, 20 stars, and a human-written PR. Revisit about 2027-01-25. awesome-nodejs (67k): 100 stars, and SaaS SDKs refused.
- sdras/awesome-actions (28k): lists reusable Actions only (this repo has no `action.yml`) and was last pushed 2024-09-01. If you add an `action.yml`, the GitHub Marketplace listing is worth more than any list.
- There's An AI For That: third-party reports say free only via a monthly X thread, otherwise about $49. Poor fit for a CLI.

## Top 5 by traffic / effort

1. skills.sh / SkillsMP (zero effort once `npx skills add` works). 2. VoltAgent list at about 50 stars. 3. heilcheng list at 20 stars. 4. Console.dev email (best non-list option, 10 min). 5. Anthropic plugin directory (highest trust; needs plugin.json, best done once for all three). DevHunt and AlternativeTo are the next two if you want search-driven traffic.
