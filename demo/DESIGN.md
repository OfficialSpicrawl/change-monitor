# Demo page design notes

Short notes so later edits stay consistent. Not an operator doc: how to run and deploy is in [README.md](README.md).

## Brief

- Subject: change-monitor, an open-source CLI that watches web pages, prints a line diff and alerts Discord or Slack. Runs from cron, GitHub Actions or as a Claude Code / Codex agent skill.
- Audience: developers and people who run coding agents. Job of the page: get them to install the skill, and to open a free Spicrawl key.
- Constraints: the page is a Cloudflare Worker serving one HTML string; strict CSP (nonce, no `unsafe-inline`, no third-party hosts except the optional analytics beacon); the Spicrawl brand is monochrome (`videos/BRAND.md`); no engine names anywhere; copy must match the README.
- Direction from the owner: clean and centered, one command as the star, lots of whitespace, mostly visual, very little text (about 90 words of prose), a headline anyone understands at first read, ascii.rest for the illustration, Geist and Geist Mono. When in doubt, remove it.
- Scope decision: a product page earns its craft in type, layout and a few precise motions. No loader, no WebGL, no smooth-scroll library.

## Concept card

```
Idea:        The page is a diff. The product's own output (a line diff with + and - lines) is the visual language.
Metaphor:    Version control and a terminal. A removed line dims and strikes through, an added line decodes in.
Signature:   The watch block under the hero: a pulse that says "watching", then a sample run that baselines a page,
             jumps "6 hours later" and lands the diff. The visitor types their own URL at the same prompt.
Emotion:     Calm and exact. A tool that tells you only what changed.
Motion verb: "resolve": an old line gives way to a new one (dim, strike, decode). Nothing bounces or glows.
Screenshot:  The hero: "Get alerted when a page changes." over the install command, the pulse and the framed diff.
```

Anchor (the fact the concept depends on): `monitor.mjs` prints a set-difference line diff with `-` and `+` lines, 20 lines at most.

Three concepts were considered: (1) the page is a diff (chosen: it is the tool's real output, so nothing is decorative); (2) a stakeout log with timestamps (generic "monitoring" skin); (3) snapshots as strata (too abstract for a CLI). Genericness test: a generic model gives a centered hero over a gradient with three feature cards. Changed: the product runs in the hero, the headline is two-tone like a diff, no cards, no gradients, one box.

## System

| Role | Value |
|---|---|
| Ground | `#16181B` |
| Card (the install command only) | `#1E2124` |
| Elevated (the added line, hovers) | `#26292D` |
| Line | `#2E3135` |
| Ink | `#F9F9F9`, the one accent |
| Muted | `#A9ADB2` |
| Removed line | `#9A9FA5` (AA on the ground), struck through |

- Dark only, on purpose: the brand and the terminal are dark; there is no light theme to maintain.
- Type: Geist (UI and headings, 600, -0.03em) and Geist Mono (commands, terminal, labels), self-hosted from the `geist` package (SIL OFL 1.1). Body 16 px, 1.5. H1 `clamp(42px, 7.4vw, 80px)`. Geist Mono has no box-drawing glyphs, so the browser falls back for the frame characters; the frame rows use a tighter line height so the rules connect.
- Layout: one centered column. Hero text is centered; the terminal block is 704 px wide and its text is left aligned. Sections are separated by whitespace, not rules or cards. The only boxes: the install command, and the ASCII frame around a diff.
- Shape: one radius, 10 px. One hairline above the terminal and above the prompt. No glow, no gradient, no shadow.
- Motion: ease `cubic-bezier(0.22, 1, 0.36, 1)`, 200 to 600 ms. Buttons wipe their fill in from the left and nudge the arrow. Under reduced motion every state change stays (colour, fill) and the movement goes; the sample run renders its final frame, the pulse and the URL ghost hold their first frame, the orb stops.
- Alive: the pulse runs and the URL field types example pages. (A border beam on the install command was tried and cut: barely visible, and it cost frames.) The sample run and the agent chat are live terminals that replay slowly while they are on screen and pause off screen; the sample stops replaying once the visitor types. Everything else is still.
- No hero background: a decorative texture has no job here. The pulse and the sample already tell the story, and any background would cost frames on a phone.

## Effects

| Where | Library | State |
|---|---|---|
| "Checking..." line in the terminal | `thinking-orbs`, `searching`, size 20 | while a check is in flight (a live check, and the "checking" beat of the sample) |
| Agent chat | `bot-avatars`, `droid` | `working` while the chat types and runs the command, `default` (idle) otherwise |
| Pulse above the terminal | ascii.rest `heartbeat`, cropped to the trace and its dotted grid | always running; its first frame is in the HTML |
| URL field before you type | ascii.rest `typewriter`, one left-aligned line | after the sample ends; stops on focus |
| The added line of the sample diff | ascii.rest `scramble`, copied to `client/pieces` (any width, one line, faster) | once, as the diff lands |

No metal text on the H1: the H1 is the LCP element and must be plain text. The orb and the bot are in different places and never touch.

## Wireframe

```
header   [Spicrawl]                                                [GitHub icon Star on GitHub 12]

                         Get alerted
                         when a page changes.
              See what changed, in Discord, Slack or your agent.
         [ $ npx skills add OfficialSpicrawl/change-monitor   copy ]   [Try Spicrawl free ->]
         [ # then: npm install, export SPICRAWL_API_KEY            ]
           Agent skill  CLI                                          Free key, 1,000 credits a month.

                            (pulse, ASCII)
         Sample run                                                          Replay sample
         ------------------------------------------------------------------------------
         $ node monitor.mjs https://acme.dev/pricing
         Changed: https://acme.dev/pricing (+1 -2 lines)
         ╭─ acme.dev/pricing ─────────────────────────────────╮
         │ - Pro plan: $20 per month.                          │
         ▌ + Pro plan: $25 per month.                          │
         ╰────────────────────────────────────────────────────╯
         ------------------------------------------------------------------------------
         $ node monitor.mjs  https://acme.dev/pricing▌                           Run

                         Ask your agent.   (labelled "Sample")
              you   Watch these 3 pages. Ping Discord on change.
              [bot] $ node monitor.mjs, its output, then a check mark

                         Start free.
                [Try Spicrawl free ->]  [GitHub icon Star on GitHub 12]
         Docs  Source  llms.txt                                  Apache-2.0. ASCII art by ascii.rest.
```

## Rules this page keeps

- AA contrast, one h1, visible focus, skip link, reduced motion, 390 px layout, no dashes in copy, no filler words, no invented numbers (the star count comes from the GitHub API through the Worker's cache and is left out when unavailable or 0).
- Copy matches `README.md` and `SKILL.md`. The sample run and the agent chat use the CLI's real output format on an invented page (`acme.dev`), and the sample is labelled "Sample run".
- Notes live in tooltips and result states, not in paragraphs: the privacy note is the form's tooltip and a line in every real result.
- Never name Spicrawl's internal engines on the page or in the API response.
