// The demo page: one HTML string with inline CSS. Its script is demo/client/main.jsx, bundled by scripts/demo-build.mjs
// to /app.js (a static asset), next to the self-hosted Geist fonts. Design notes: demo/DESIGN.md.
// The worker swaps <!--BEACON--> for the analytics tags when they are configured, <!--TURNSTILE--> for the Turnstile widget
// when it is configured, and __NONCE__ for the per-response CSP nonce.

import { pulseFrame } from "../client/ascii.js";

export const REPO_URL = "https://github.com/OfficialSpicrawl/change-monitor";
export const KEY_URL = "https://app.spicrawl.com";
const DOCS_URL = "https://docs.spicrawl.com";
const SITE_URL = "https://change-monitor.spicrawl.com";
const SAMPLE_URL = "https://example.com";
const DESCRIPTION =
  "Open-source CLI that watches web pages, prints a line diff when they change and alerts Discord or Slack. Runs from cron, GitHub Actions or a coding agent.";

export const RUN_COMMANDS = `git clone ${REPO_URL}.git
cd change-monitor
npm install
export SPICRAWL_API_KEY=spicrawl_live_...   # free key: ${KEY_URL}
node monitor.mjs https://example.com`;

/** GET /llms.txt: the same facts as the page, for agents. */
export const LLMS_TXT = `# change-monitor

> ${DESCRIPTION} It scrapes pages with the Spicrawl API.

## Install

- Agent skill (Claude Code, Codex, Cursor and more): \`npx skills add OfficialSpicrawl/change-monitor\`, then run \`npm install\` in the installed folder.
- CLI: \`git clone ${REPO_URL} && cd change-monitor && npm install\`
- A free Spicrawl API key (1,000 credits a month) from ${KEY_URL}, exported as SPICRAWL_API_KEY.

## Use

- \`node monitor.mjs [options] [url ...]\` scrapes each URL to Markdown, compares it with the last snapshot and prints Baseline saved, Unchanged, Changed (with a line diff) or Blocked/unavailable.
- Options: \`-f, --file <path>\` URL list (default urls.txt), \`-s, --state <path>\` snapshot file (default .monitor-state.json), \`-e, --every <time>\` keep running (30s, 15m, 1h).
- Environment: SPICRAWL_API_KEY (required), DISCORD_WEBHOOK_URL and SLACK_WEBHOOK_URL (optional, a change is posted).
- A plain scrape costs 1 credit. A page that needs rendering costs more. Keep the URL list short on the free plan.

## Links

- [README](${REPO_URL}#readme)
- [SKILL.md](${REPO_URL}/blob/main/SKILL.md)
- [Spicrawl docs](${DOCS_URL})
- [Live demo](${SITE_URL})
`;

const GITHUB_MARK = `<svg class="ico" aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>`;

// "Star on GitHub" with the live count. The count is filled in by the client (stars.js) and stays hidden when unknown or 0.
const starButton = (cls = "") =>
  `<a class="btn btn-line star ${cls}" data-star href="${REPO_URL}" rel="noopener" aria-label="Star on GitHub">${GITHUB_MARK}<span class="star-label">Star<span class="long"> on GitHub</span></span><span class="count" data-count hidden></span></a>`;

const tryButton = () =>
  `<a class="btn btn-solid" href="${KEY_URL}" rel="noopener">Try Spicrawl free <span class="arrow" aria-hidden="true">&rarr;</span></a>`;

const WORDMARK = `<img src="/spicrawl.svg" alt="Spicrawl" width="90" height="28">`;

// What the sample run ends on, for people without JavaScript.
const FINAL_FRAME = `<div class="ln sh"><span class="prompt">$ </span>node monitor.mjs ${SAMPLE_URL}</div>
<div class="ln"><span class="strong">Changed: </span>${SAMPLE_URL} (+1 -2 lines)</div>
<div class="ln box"><span class="edge">│ </span><span class="cell del"><span class="t">- An old line that was removed.</span></span></div>
<div class="ln box"><span class="edge">▌ </span><span class="cell add">+ This domain is for use in documentation examples.</span></div>`;

// The agent chat as the HTML holds it: the finished frame. The client replays it as a live terminal.
const CHAT_FINAL = `<div class="ln sh"><span class="prompt">$ </span>node monitor.mjs</div>
<div class="ln">Baseline saved: <span class="mut">https://example.com</span></div>
<div class="ln">Baseline saved: <span class="mut">https://www.iana.org/help/example-domains</span></div>
<div class="ln">Baseline saved: <span class="mut">https://en.wikipedia.org/wiki/Main_Page</span></div>
<div class="ln mut">Credits used this run: 3</div>
<div class="ln ok">\u2713 Baselines saved for 3 pages.</div>`;

const JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "change-monitor",
  description: DESCRIPTION,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Node.js 18 or later",
  license: "https://www.apache.org/licenses/LICENSE-2.0",
  url: SITE_URL,
  sameAs: [REPO_URL],
  isAccessibleForFree: true,
  publisher: { "@type": "Organization", name: "Spicrawl", url: DOCS_URL },
});

const PULSE = pulseFrame();

const FONT_LINKS = `<link rel="preload" href="/fonts/Geist-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/GeistMono-Variable.woff2" as="font" type="font/woff2" crossorigin>`;

const CSS = `
@font-face { font-family: "Geist"; src: url(/fonts/Geist-Variable.woff2) format("woff2"); font-weight: 100 900; font-display: swap; }
@font-face { font-family: "Geist Mono"; src: url(/fonts/GeistMono-Variable.woff2) format("woff2"); font-weight: 100 900; font-display: swap; }
:root {
  --bg: #16181B; --card: #1E2124; --elev: #26292D; --line: #2E3135;
  --ink: #F9F9F9; --mut: #A9ADB2; --dim: #9A9FA5;
  --r: 10px; --ease: cubic-bezier(0.22, 1, 0.36, 1); --pad: 20px;
  --sans: "Geist", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --art: ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, "Geist Mono", monospace; /* box-drawing glyphs, for the ascii pieces */
}
@media (min-width: 640px) { :root { --pad: 32px; } }
* { box-sizing: border-box; }
html { background: var(--bg); color-scheme: dark; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 400 16px/1.5 var(--sans); -webkit-text-size-adjust: 100%; -webkit-font-smoothing: antialiased; }
a { color: inherit; text-underline-offset: 3px; }
:focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; border-radius: 4px; }
h1, h2, p { margin: 0; }
code, pre { font-family: var(--mono); }
.sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.skip { position: absolute; left: var(--pad); top: -64px; z-index: 10; padding: 10px 14px; border-radius: var(--r); background: var(--ink); color: var(--bg); font-weight: 600; text-decoration: none; }
.skip:focus { top: 12px; }
.wrap { max-width: calc(1080px + 2 * var(--pad)); margin: 0 auto; padding-left: var(--pad); padding-right: var(--pad); }
.fine { font: 400 13px/1.5 var(--mono); color: var(--mut); }
.mut { color: var(--mut); }

/* Buttons: one treatment. The fill wipes in from the left, like a line being replaced. */
.btn {
  position: relative; isolation: isolate; overflow: hidden;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  height: 48px; padding: 0 20px; border: 1px solid var(--ink); border-radius: var(--r);
  font: 500 15px/1 var(--sans); text-decoration: none; cursor: pointer; white-space: nowrap;
  transition: color 0.3s var(--ease), border-color 0.3s var(--ease);
}
.btn::before { content: ""; position: absolute; inset: 0; z-index: -1; transform: scaleX(0); transform-origin: left; transition: transform 0.4s var(--ease); }
.btn-solid { background: var(--ink); color: var(--bg); }
.btn-solid::before { background: var(--bg); }
.btn-line { background: transparent; color: var(--ink); border-color: #4A4E54; }
.btn-line::before { background: var(--ink); }
.btn .arrow { display: inline-block; transition: transform 0.3s var(--ease); }
@media (hover: hover) {
  .btn:hover::before { transform: scaleX(1); }
  .btn-solid:hover { color: var(--ink); }
  .btn-line:hover { color: var(--bg); border-color: var(--ink); }
  .btn:hover .arrow { transform: translateX(4px); }
}
.btn:focus-visible::before { transform: scaleX(1); }
.btn-solid:focus-visible { color: var(--ink); }
.btn-line:focus-visible { color: var(--bg); border-color: var(--ink); }

/* Header */
.bar { display: flex; align-items: center; justify-content: space-between; height: 72px; }
.brand { display: block; line-height: 0; transition: opacity 0.25s var(--ease); }
@media (hover: hover) { .brand:hover { opacity: 0.7; } }
.brand img { display: block; }
.star { height: 40px; padding: 0 14px; font-size: 14px; }
.star .count { padding-left: 10px; margin-left: 2px; border-left: 1px solid color-mix(in srgb, currentColor 35%, transparent); font: 500 13px var(--mono); }
@media (max-width: 479px) { .bar .star .long { display: none; } }

/* Hero */
.hero { padding-top: 64px; text-align: center; }
@media (min-width: 640px) { .hero { padding-top: 104px; } }
h1 { font-size: clamp(42px, 7.4vw, 80px); line-height: 1.02; letter-spacing: -0.035em; font-weight: 600; }
h1 span { display: block; }
.l1 { color: var(--mut); }
.sub { margin: 24px auto 0; max-width: 40ch; font-size: 17px; color: var(--mut); text-wrap: balance; }
@media (min-width: 760px) { .sub { max-width: none; font-size: 18px; } }
.cta { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: center; gap: 12px 12px; margin-top: 40px; }
.cta-cmd { display: grid; gap: 10px; justify-items: start; width: min(100%, 540px); text-align: left; }
.cta-cmd > div:first-child { width: 100%; }
.cta-go { display: grid; gap: 10px; justify-items: center; }
@media (max-width: 639px) { .cta-go { width: 100%; } .cta-go .btn { width: 100%; } }

/* The install command: the one box on the page that moves (border-beam wraps it once the script has run) */
.cmd { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; padding: 8px 8px 8px 16px; background: var(--card); border: 1px solid var(--line); border-radius: var(--r); }
.cmd code { font: 500 14px/1.45 var(--mono); overflow-wrap: anywhere; }
.prompt { color: var(--mut); }
.copy { appearance: none; flex: none; display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 8px; background: none; color: var(--mut); cursor: pointer; transition: color 0.2s var(--ease), background 0.2s var(--ease); }
@media (hover: hover) { .copy:hover { background: var(--ink); color: var(--bg); } }
.copy:focus-visible { background: var(--ink); color: var(--bg); }
.copy-slot { flex: none; width: 32px; height: 32px; }
.tabs { display: flex; gap: 4px; margin-left: -8px; }
.tab { appearance: none; min-height: 28px; padding: 0 8px; border: 0; border-radius: 6px; background: none; color: var(--mut); font: 500 12px var(--mono); cursor: pointer; text-decoration: underline; text-decoration-color: transparent; text-underline-offset: 6px; transition: text-decoration-color 0.2s var(--ease), color 0.2s var(--ease); }
.tab[aria-pressed="true"], .tab.is-on { color: var(--ink); text-decoration-color: var(--ink); }
@media (hover: hover) { .tab:hover { color: var(--ink); background: var(--elev); } }

/* Watch: the pulse, then the terminal. No card; the only box is the ASCII frame around a diff. */
.watch { max-width: 704px; margin: 72px auto 0; padding: 0 var(--pad); }
@media (min-width: 640px) { .watch { margin-top: 96px; } }
.pulse { display: block; width: max-content; max-width: 100%; height: 114px; margin: 0 auto 32px; overflow: hidden; font: 400 11px/1.15 var(--art); color: var(--dim); white-space: pre; }
.wbar { display: flex; align-items: center; justify-content: space-between; min-height: 36px; padding-bottom: 8px; border-bottom: 1px solid var(--line); font: 500 12px var(--mono); color: var(--mut); }
.link { appearance: none; padding: 6px 0; border: 0; background: none; color: var(--ink); font: 500 12px var(--mono); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.link[hidden] { display: none; }
.out { min-height: 248px; padding: 18px 0 14px; font: 400 14px/1.7 var(--mono); }
.ln { white-space: pre-wrap; overflow-wrap: anywhere; }
.ln.mut, .ln.note { color: var(--mut); }
.ln.note { margin-top: 10px; font-size: 12px; }
.ln.later { margin: 14px 0; color: var(--mut); }
.ln.rule, .ln.box { white-space: pre; overflow: hidden; line-height: 1.3; }
.ln.rule { color: var(--mut); }
.ln.sh { font-weight: 500; }
.ln.sh .prompt { color: var(--ink); font-weight: 700; }
.strong { font-weight: 600; }
.probe { position: absolute; visibility: hidden; white-space: pre; }
.cur { display: inline-block; width: 0.6em; height: 1.15em; margin-left: 2px; vertical-align: -0.2em; background: var(--ink); animation: blink 1.1s steps(1) infinite; }
@keyframes blink { 50% { opacity: 0; } }
.cmds { color: var(--mut); }
.orb { display: inline-block; width: 20px; height: 20px; vertical-align: -5px; }
.edge { color: var(--mut); }
.cell { white-space: pre; }
.cell.del { color: var(--dim); }
.cell.del .t { text-decoration: line-through; text-decoration-thickness: 1px; text-decoration-color: var(--dim); }
.cell.add { background: var(--elev); color: var(--ink); font-weight: 500; }
.box:has(.cell.add) .edge:first-child { color: var(--ink); }
/* The diff resolves: a removed line is first plain, then dims and strikes through. */
.cell.del.land { color: var(--ink); transition: color 0.6s var(--ease); }
.cell.del.land .t { text-decoration-color: transparent; transition: text-decoration-color 0.6s var(--ease); }
.cell.del.land.in { color: var(--dim); }
.cell.del.land.in .t { text-decoration-color: var(--dim); }
.prompt-line { display: flex; align-items: center; gap: 12px; padding-top: 12px; border-top: 1px solid var(--line); font: 500 14px var(--mono); }
.ps1 { flex: none; color: var(--ink); white-space: pre; }
.ps1 b { color: var(--ink); font-weight: 700; }
.field { position: relative; flex: 1; min-width: 0; }
.field input { display: block; width: 100%; height: 40px; padding: 0; border: 0; border-radius: 0; background: none; color: var(--ink); font: 400 14px var(--mono); }
.field input::placeholder { color: #8A9096; opacity: 1; }
.field input:focus-visible { outline: none; box-shadow: 0 2px 0 var(--ink); }
.field.ghosting input::placeholder { color: transparent; }
.ghost { position: absolute; inset: 0; display: flex; align-items: center; margin: 0; color: #8A9096; font: 400 14px/1 var(--art); white-space: pre; pointer-events: none; overflow: hidden; }
.ghost[hidden] { display: none; }
.run { appearance: none; flex: none; min-height: 36px; padding: 0 10px; border: 0; border-radius: 6px; background: none; color: var(--ink); font: 500 13px var(--mono); cursor: pointer; transition: background 0.25s var(--ease), color 0.25s var(--ease); }
@media (hover: hover) { .run:hover:not(:disabled) { background: var(--ink); color: var(--bg); } }
.run:focus-visible { background: var(--ink); color: var(--bg); }
.run:disabled { color: var(--mut); cursor: progress; }
.cf-turnstile { margin-top: 8px; }
.hint { padding-top: 6px; }

/* Agent */
.agent { max-width: 624px; margin: 0 auto; padding: 112px var(--pad) 0; }
h2 { font-size: clamp(30px, 4vw, 44px); line-height: 1.08; letter-spacing: -0.03em; font-weight: 600; text-align: center; }
.chat { display: grid; gap: 22px; margin-top: 40px; }
.you { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 16px; align-items: baseline; font-size: 17px; }
.who { color: var(--mut); font: 500 12px var(--mono); }
.msg-bot { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 16px; align-items: start; }
.bot { width: 44px; height: 44px; }
.msg-bot .out { min-height: 156px; padding: 4px 0 0; }
@media (max-width: 639px) { .msg-bot { grid-template-columns: 1fr; gap: 12px; } .msg-bot .out { min-height: 236px; } }
.ln.ok { margin-top: 6px; }

/* 404 */
.lost { display: grid; justify-items: center; gap: 32px; padding-top: 96px; padding-bottom: 96px; text-align: center; }
.lost .out { min-height: 0; padding: 0; text-align: left; }

/* Finale and footer */
.finale { padding-top: 112px; text-align: center; }
.finale .cta { margin-top: 32px; }
.foot { margin-top: 112px; padding-bottom: 32px; }
.foot-in { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 32px; padding-top: 20px; border-top: 1px solid var(--line); }
.foot nav { display: flex; flex-wrap: wrap; gap: 4px 20px; }
.foot a, .foot p { font: 400 13px/1.5 var(--mono); color: var(--mut); }
.foot a { display: inline-block; padding: 6px 0; text-decoration-thickness: 1px; transition: color 0.2s var(--ease), text-decoration-thickness 0.2s var(--ease); }
@media (hover: hover) { .foot a:hover { color: var(--ink); text-decoration-thickness: 2px; } }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition-duration: 0.01ms !important; transition-delay: 0s !important; }
}
`;

export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>change-monitor: get alerted when a page changes | Spicrawl</title>
<meta name="description" content="${DESCRIPTION}">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#16181B">
<meta name="csp-nonce" content="__NONCE__">
<link rel="canonical" href="${SITE_URL}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Spicrawl">
<meta property="og:title" content="change-monitor: get alerted when a page changes">
<meta property="og:description" content="${DESCRIPTION}">
<meta property="og:url" content="${SITE_URL}/">
<meta property="og:image" content="${SITE_URL}/og.png">
<meta property="og:image:width" content="1280">
<meta property="og:image:height" content="640">
<meta property="og:image:alt" content="A terminal showing node monitor.mjs printing a changed page with a removed and an added line.">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%2316181B'/%3E%3Ctext x='16' y='23' font-size='20' text-anchor='middle' fill='%23F9F9F9' font-family='sans-serif' font-weight='700'%3ES%3C/text%3E%3C/svg%3E">
<link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt">
${FONT_LINKS}
<style nonce="__NONCE__">${CSS}</style>
<script type="application/ld+json">${JSON_LD}</script>
<!--BEACON-->
<script type="module" src="/app.js"></script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="wrap bar">
  <a class="brand" href="/" aria-label="Spicrawl change-monitor, home">${WORDMARK}</a>
  ${starButton()}
</header>

<main id="main">
  <section class="wrap hero" aria-labelledby="top-h">
    <h1 id="top-h"><span class="l1">Get alerted</span> <span class="l2">when a page changes.</span></h1>
    <p class="sub">See exactly what changed, in Discord, Slack or your agent.</p>
    <div class="cta">
      <div class="cta-cmd">
        <div id="install">
          <div class="cmd"><code><span class="prompt" aria-hidden="true">$ </span>npx skills add OfficialSpicrawl/change-monitor</code><span class="copy-slot"></span></div>
          <div class="tabs"><span class="tab is-on">Agent skill</span></div>
          <noscript><p class="fine">CLI: git clone ${REPO_URL} &amp;&amp; cd change-monitor &amp;&amp; npm install</p></noscript>
        </div>
      </div>
      <div class="cta-go">
        ${tryButton()}
        <p class="fine">Free key, 1,000 credits a month.</p>
      </div>
    </div>
  </section>

  <section class="watch" aria-label="Demo">
    <pre class="pulse" id="pulse" aria-hidden="true">${PULSE}</pre>
    <div class="wbar"><span id="mode">Sample run</span><button type="button" class="link" id="replay" hidden>Replay sample</button></div>
    <div id="term">
      <div class="out" id="out"><noscript>${FINAL_FRAME}</noscript></div>
      <form class="prompt-line" id="form" novalidate title="Public pages only. Snapshots are shared by URL and kept 7 days.">
        <label class="sr-only" for="url">Page URL to check</label>
        <span class="ps1" aria-hidden="true"><b>$</b> node monitor.mjs</span>
        <span class="field" id="field"><input id="url" name="url" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="2048" placeholder="https://example.com" aria-describedby="hint"><span class="ghost" id="ghost" aria-hidden="true" hidden></span></span>
        <button type="submit" class="run" id="go">Run &#8629;</button>
      </form>
      <!--TURNSTILE-->
      <p class="fine hint" id="hint">Public pages only.</p>
    </div>
    <div class="sr-only" id="live" aria-live="polite" aria-atomic="true"></div>
  </section>

  <section class="agent" aria-labelledby="agent-h">
    <h2 id="agent-h">Ask your agent.</h2>
    <div class="chat" id="chat" role="group" aria-label="Example conversation">
      <p class="you"><span class="who">you</span><span>Watch these 3 pages. Ping Discord on change.</span></p>
      <div class="msg-bot">
        <div class="bot" id="bot"></div>
        <div class="out" id="chat-out">${CHAT_FINAL}</div>
      </div>
    </div>
  </section>

  <section class="wrap finale" aria-labelledby="end-h">
    <h2 id="end-h">Start free.</h2>
    <div class="cta">${tryButton()}${starButton()}</div>
  </section>
</main>

<footer class="wrap foot"><div class="foot-in">
  <nav aria-label="Footer"><a href="${DOCS_URL}" rel="noopener">Docs</a><a href="${REPO_URL}" rel="noopener">Source</a><a href="/llms.txt">llms.txt</a></nav>
  <p>Apache-2.0. ASCII art by <a href="https://ascii.rest" rel="noopener">ascii.rest</a>.</p>
</div></footer>
</body>
</html>
`;

/** The 404 page: the same shell, and the page's own idea (a diff) in small. */
export const NOT_FOUND = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found | change-monitor</title>
<meta name="robots" content="noindex">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#16181B">
${FONT_LINKS}
<style nonce="__NONCE__">${CSS}</style>
</head>
<body>
<header class="wrap bar"><a class="brand" href="/" aria-label="Spicrawl change-monitor, home">${WORDMARK}</a></header>
<main class="wrap lost">
  <h1><span class="l2">Page not found.</span></h1>
  <div class="out"><div class="ln box"><span class="edge">│ </span><span class="cell del"><span class="t">- /this-page</span></span></div><div class="ln box"><span class="edge">▌ </span><span class="cell add">+ /</span></div></div>
  <p><a class="btn btn-solid" href="/">Back to change-monitor <span class="arrow" aria-hidden="true">&rarr;</span></a></p>
</main>
</body>
</html>
`;
