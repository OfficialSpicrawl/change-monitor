# Spicrawl change-monitor video kit

The look, rules, assets and code for the change-monitor film. The film prompt ([change-monitor-prompt.md](change-monitor-prompt.md)) only adds the story.
Sources: Spicrawl's own theme (`.spicrawl-theme` in `webora-ui/landing/src/styles/globals.css`), the terminal chrome in `webora-ui/landing/src/components/spicrawl/HeroTerminal.tsx` and `CodePanel.tsx` (`TerminalFrame`), the shared brief `OfficialSpicrawl/FILM-BRIEF.md`, and `../monitor.mjs` + `../README.md` for what the tool does. When this file and those disagree, they win.

## The brief (from the interview, done by the coordinator)
- Plays: GitHub README (GIF) and X/LinkedIn (MP4 with sound). Format: 16:9, 1920x1080, 30 fps. Length: 15 to 20 s (this cut: 18.5 s).
- Music: none. Narration only, Kokoro TTS, voice `af_heart`, reading the captions. About -16 LUFS.
- Must show: `node monitor.mjs` baselines, a second run with a diff, a Discord/Slack alert, the end card.
- Ingredients chosen: brand element: Spicrawl mark + wordmark (the lockup SVG), end card only · words: one short caption per beat, blur-swapping · transitions: clean cuts · extras: typed terminal (frame-driven), no mascot.
- Ending: "Free and open source. Built on Spicrawl." with the mark, "Change monitor", `github.com/OfficialSpicrawl/change-monitor`, `change-monitor.spicrawl.com`.

## Hard rules
- Casing: sentence case in captions, the product's own text verbatim in the terminal (README output, captured 2026-10-23).
- Type: Inter for UI and captions, JetBrains Mono for terminal and code, Righteous only for the "Spicrawl" wordmark (it comes in the lockup SVG; the font file is copied but unused) (brief).
- Corners: 10 px (brief).
- Surfaces: ground `#16181B`; card `#1E2124`; elevated `#26292D` (the added diff line, the notification's mark tile); nothing else (brief).
- Borders and shadows: 1 px `#2E3135` on cards. One soft black drop shadow under floating cards, as `TerminalFrame` has (`shadow-2xl shadow-black/40`). No glow (HeroTerminal.tsx).
- Copy: no emojis, no dashes as punctuation, plain words, no hype.
- Claims: see "Claims".

## Frame (1920x1080, 30 fps, dark)
- Framing: full bleed ground. Terminal window 1680x664 at (120, 100). Caption band centred at y 860 to 940. Content stays 100 px or more from the edges.
- Words: captions in Inter 600, 64 px, `#F9F9F9`, one line, fixed band under the window, never overlapping it. A caption holds its whole beat (3 to 5 s); a swap blurs the old line out (0.25 s) and the new one in (0.45 s, 24 px rise, 14 px blur, `cubic-bezier(0.22, 1, 0.36, 1)`).
- Scenes: UI text only, plus the end card text.

## Color
| Token | Value | Use |
|---|---|---|
| background | `#16181B` | ground, frame 0 |
| card | `#1E2124` | terminal body, notification card, chips |
| elevated | `#26292D` | the `+` line's bar, the mark tile |
| border | `#2E3135` | card and chip outlines |
| terminal header | `#1B1D20` / line `#292C30` | `background` at 40% over card, `border` at 70% over card, as `TerminalFrame` |
| foreground | `#F9F9F9` | captions, commands, `Changed:` line, added line |
| muted foreground | `#A9ADB2` | timestamps, URLs in output, credits, second URL on the end card |
| code steps | keyword `#F9F9F9`, string `#D5D7DA`, number `#A9ADB2`, flag `#8F9398`, comment `#868A90` | luminance only. Hex taken from the brief's tone ladder; the `oklch()` values in globals.css decode a little darker than their `#16181B`-style comments, the brief's hex wins |
| removed line | `#7E8288` | dimmer than muted, about 4.3:1 on the card |
| accent | white `#F9F9F9` | the only accent; no status hues (no red/green diff) |

Hex only for anything that animates.

## Type
- Inter variable (wght), JetBrains Mono variable (wght), both `latin` woff2 from `webora-ui/landing/node_modules/@fontsource-variable/*`, copied to `public/fonts/` (gitignored). Righteous 400 woff2 also copied, unused.
- Sizes at 1080p: captions 64, end title 104, terminal 28 (line height 44), end URLs 38, notification message 40, chips 28. Ligatures off in mono (`://` otherwise gets a gap).

## Signature elements
| Element | Look | Source | In films |
|---|---|---|---|
| Terminal window | 1 px border, card ground, 56 px header strip with the title in mono 22 px muted, 10 px radius | `TerminalFrame` | one window across beats 1 and 2, content swaps on the cut |
| Prompt and cursor | `$ ` in white bold; white block cursor (0.6 em wide), solid while typing, 1 Hz blink at rest | HeroTerminal (`text-primary` prompt and block cursor) | frame-driven, typing paced per character with a fixed pseudo-random wobble |
| Diff | added line bright (`#F9F9F9`, 500) on the elevated bar with a 3 px white left rule; removed lines dim; `Changed:` bold | brief ("luminance, no red/green") | the `+` bar fades in 0.3 s when its line lands |
| Notification card | Spicrawl mark tile + "Change monitor" + "just now", message in mono. Not a Discord or Slack clone | brief | two env-var chips above it (`DISCORD_WEBHOOK_URL`, `SLACK_WEBHOOK_URL`) tie it to what the tool reads |
| Wordmark/mark | `public/brand/*.svg`, the `dark` variants (white fill) | `webora-ui/landing/public/spicrawl assets/svg/` | lockup on the end card at 660 px wide, mark in the notification tile |

## Logo and brand element
- Logo: lockup SVG on the end card (blur-in), mark SVG in the notification tile. No mascot.
- Never: tinted logo, gradient, glow, another hue.

## Cursors
None (a terminal film). The only cursor is the terminal's text cursor.

## Components
| Need | Component | In films |
|---|---|---|
| Terminal chrome | `TerminalFrame` (CodePanel.tsx) | redrawn in `src/Film.tsx` with inline styles; it is a pure component but pulls in Tailwind and the app's CSS, and the typing needs a frame clock |
| Typing, lines | `HeroTerminal.tsx` | redrawn: that one runs `setTimeout` loops, so it is replaced by a function of `t` |

## Motion
- Easing: `cubic-bezier(0.22, 1, 0.36, 1)` (brief). No springs, no bounce.
- Transitions: clean cuts on beat boundaries (5.6 s, 10.9 s, 14.1 s). Captions blur-swap.

## Claims
- The film may show: scraping a URL list to Markdown, a baseline on first sight, a line diff on a later run, credits used per run, alerts to Discord and Slack webhooks. Free plan 1,000 credits/month (not shown on screen).
- Must not show: search, crawl, AI extraction, anything the README does not list.
- The terminal output is the README's, captured 2026-10-23. For the second run the stored snapshot was edited by hand to force a change (the README says so; the old line "docs (old wording)" is that edit). The second command is `node monitor.mjs https://example.com` because the real run checked one URL (`Checking 1 URL(s)`); URL arguments replace `urls.txt`. The `...` at the end of the diff lines is as in the README. The film's `urls.txt` has only the three URLs; the repo's has two comment lines as well.
- The notification card shows the first line the tool posts. The real Discord/Slack message also carries the diff lines.
- Approved lines: "Watch any page for changes." "Run it again. See exactly what changed." "Get pinged on Discord or Slack." "Free and open source. Built on Spicrawl."
- Words to avoid: AI, crawl, search, "free forever", guarantees, "instant".

## Workspace
- `videos/` is its own npm package: `remotion` and every `@remotion/*` pinned to 4.0.538, `react` 19.2.0. No Tailwind.
- `scripts/narration.sh` (Kokoro clips and `src/clips.json`), `scripts/say.py`, `scripts/stills.ts` (bundle once, many stills; `--debug` prints `[data-target]` boxes), `scripts/render.ts` (master, narration mix, motion blur, MP4, GIF, poster), `scripts/verify.py`.
- Final render: 120 fps master (4 subframes per frame), `tmix=4` to 30 fps, one colour conversion (the master is limited range BT.601, untagged; converted to BT.709 limited, tagged), x264 CRF 16, AAC 192k. System ffmpeg 6.1 (has tmix/select/tile).
- `out/review/` and `out/**/work/` are gitignored; `out/change-monitor/vN/` is kept per version.

## Measured (debug stills, `scripts/stills.ts --debug`, 1080p)
- Terminal window: 1680x664, x 120 to 1800, y 101 to 765. Longest line (the removed diff line) ends at x 1620, inside the 1760 inner edge.
- Caption band: y 862 to 939 (77 px high), 97 px under the window, so it never overlaps the UI.
- Notification card: 1240x229, y 381 to 610; chips at y 230 to 293.
- End card: lockup at y 150 (660x148), title 104 px at y 330, repo line y 510, site line y 580.
- Delivered file decodes frame 0 to rgb(21,22,27) against the #16181B ground (22,24,27): within 2 per channel (BT.709 limited range with 4:2:0).
