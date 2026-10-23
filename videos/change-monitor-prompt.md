<context>
The Spicrawl change monitor (`../monitor.mjs`) watches a list of URLs with the Spicrawl API. Each run scrapes every page to Markdown, compares it with the last snapshot, prints a short line diff when a page changed, and can post the change to a Discord or Slack webhook. It is a free, open-source example built on Spicrawl.
This film plays on the GitHub README (as a GIF) and on X and LinkedIn (MP4 with narration). It must also read with the sound off: every beat has a caption.
Read `videos/BRAND.md` first. It holds the brief, the look, the brand element, the components and what we may claim. This prompt only adds the story.
</context>

<inputs>
Decided: 1920x1080, 30 fps (rendered at 120 fps and blended to 30 for motion blur), dark, 18.5 s. Music: none. Narration: Kokoro `af_heart`, one clip per caption, in `public/audio/` (n1 2.225 s, n2 3.000 s, n3 2.375 s, n4 3.200 s, measured; `src/clips.json`). Beats are timed to the clips, not to a tempo.
</inputs>

<direction>
Calm and exact, like the product's own hero terminal. One idea per beat, one caption per beat, something moving on every beat.
Ingredients (from the interview): Spicrawl lockup on the end card only · captions, blur-swapped · clean cuts · typed terminal, no cursor arrow.
Only the product's own surfaces, colors, borders and effects. White is the only accent; the diff reads as luminance, not red and green.
Banned: glows, particles, bounce, gradients, a Discord or Slack UI clone or their logos, search/crawl/AI claims, a second hue.
</direction>

<cast>
- The brand element: the Spicrawl mark in the notification tile and the lockup (mark + wordmark) on the end card.
- Cursors: only the terminal's block cursor.
- Demo world: `urls.txt` = `https://example.com`, `https://www.iana.org/help/example-domains`, `https://en.wikipedia.org/wiki/Main_Page`. The output is the README's real run (2026-10-23).
</cast>

<structure>
No tempo; times in seconds from `src/cues.ts` (the beat sheet as data). Something happens at every beat.

0.00  Frame 0 is pure ground. The terminal window blurs in (0.10 to 0.65).
Beat 1, 0.00 to 5.60. Caption "Watch any page for changes." (0.25), voice at 0.55.
  0.60  `$ cat urls.txt` typed. 1.45 to 1.65 the three URLs land.
  2.00  `$ node monitor.mjs` typed. 3.10 Enter. 3.20 header `Checking 3 URL(s)`.
  3.70, 4.20, 4.70  three `Baseline saved:` lines. 5.10 `Credits used this run: 3`. 5.35 a fresh prompt.
Beat 2, 5.60 to 10.90. Hard cut to a clean window. Caption "Run it again. See exactly what changed." (5.60), voice at 5.90.
  6.05  `$ node monitor.mjs https://example.com` typed (the real run checked one URL). 7.55 Enter. 7.65 header `Checking 1 URL(s)`.
  8.15  `Changed: https://example.com (+1 -2 lines)` (bold). 8.50 and 8.75 the two removed lines (dim).
  9.00  the added line, bright, on the elevated bar. 9.55 `Credits used this run: 1`. 9.85 prompt.
Beat 3, 10.90 to 14.10. Hard cut. Caption "Get pinged on Discord or Slack." (10.90), voice at 11.20.
  11.15 and 11.30 the two env-var chips (`DISCORD_WEBHOOK_URL`, `SLACK_WEBHOOK_URL`). 11.65 the notification card rises in:
  mark tile, "Change monitor", "just now", `Changed: https://example.com (+1 -2 lines)`. Poster frame at 13.10.
Beat 4, 14.10 to 18.50. Hard cut. Caption "Free and open source. Built on Spicrawl." (14.10), voice at 14.40 (ends 17.60).
  14.20 lockup, 14.45 "Change monitor", 14.80 `github.com/OfficialSpicrawl/change-monitor`, 15.00 `change-monitor.spicrawl.com`. Hold to 18.50.
No loop: the GIF restarts with a clean cut from the end card to the empty ground.
</structure>

<build>
1. Remotion in `videos/` (BRAND.md "Workspace"). Kit in `src/kit/` (`time.ts`, `debug.tsx`), this film in `src/Film.tsx`, `src/cues.ts`, `src/tokens.ts`.
2. Every style is a pure function of `t = frame / fps`. The typing is `charTime(start, speed, i)`: an even pace with a fixed deterministic wobble. The cursor blink is `floor(t * 2) % 2`.
3. `cues.ts` is the beat sheet as data; scene code never holds a literal time.
4. Narration: `scripts/narration.sh`. Render: `bun scripts/render.ts v1`. Check: `uv run --with numpy python3 scripts/verify.py out/change-monitor/v1`. Stills: `bun scripts/stills.ts out/change-monitor/v1/stills <frames> --composition ChangeMonitor` (30 fps frame numbers).
</build>

<gotchas>
Frame 0 must be the bare ground so it decodes to #16181B at the centre. Keep mono ligatures off. A typed row keeps its slot; rows only append, so nothing re-centers. The window height is fixed so the cut between runs does not jump. Judge the encoded file and decode its pixels, not the PNG stills.
Claims: the diff in beat 2 comes from a snapshot edited by hand to force a change (BRAND.md "Claims"). Do not call it a live detection of a real edit.
</gotchas>
