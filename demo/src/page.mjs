// The demo page: one HTML string, inline CSS and JS, no framework, no build step.
// The worker swaps <!--BEACON--> for the Cloudflare Web Analytics tag when a token is set, <!--TURNSTILE-->
// for the Turnstile widget when it is configured, and __NONCE__ for the per-response CSP nonce.

export const REPO_URL = "https://github.com/OfficialSpicrawl/change-monitor";
export const KEY_URL = "https://app.spicrawl.com";

export const RUN_COMMANDS = `git clone ${REPO_URL}.git
cd change-monitor
npm install
export SPICRAWL_API_KEY=spicrawl_live_...   # free key: ${KEY_URL}
node monitor.mjs https://example.com`;

export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Change monitor demo - Spicrawl</title>
<meta name="description" content="Paste a URL and see what changed since your last check. A live demo of the open-source Spicrawl change monitor.">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#16181B">
<meta property="og:title" content="Spicrawl change monitor - live demo">
<meta property="og:description" content="Paste a URL, save a baseline, check again later and see the line diff.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%2316181B'/%3E%3Ctext x='16' y='23' font-size='20' text-anchor='middle' fill='%23F9F9F9' font-family='sans-serif' font-weight='700'%3ES%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Righteous&text=Spicrawl&display=swap">
<style nonce="__NONCE__">
:root {
  --bg: #16181B;
  --card: #1E2124;
  --border: #2E3135;
  --text: #F9F9F9;
  --muted: #A9ADB2;
  --add-bg: #2B2F34;
  --del: #8D9298;
  --radius: 10px;
  --sans: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
* { box-sizing: border-box; }
html { background: var(--bg); color-scheme: dark; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 400 16px/1.55 var(--sans);
  -webkit-text-size-adjust: 100%;
}
a { color: var(--text); text-underline-offset: 3px; }
a:hover { text-decoration-thickness: 2px; }
:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
.wrap { max-width: 760px; margin: 0 auto; padding: 0 16px 56px; }
@media (min-width: 640px) { .wrap { padding: 0 24px 72px; } }

header { display: flex; align-items: center; gap: 12px; padding: 20px 0; border-bottom: 1px solid var(--border); }
.brand { font: 400 26px/1 "Righteous", var(--sans); letter-spacing: 0.01em; text-decoration: none; }
.sub { color: var(--muted); font-weight: 500; white-space: nowrap; }
.gh { margin-left: auto; color: var(--muted); font-size: 14px; padding: 10px 0 10px 8px; }
.gh:hover { color: var(--text); }

h1 { font-size: clamp(26px, 6vw, 36px); line-height: 1.15; letter-spacing: -0.02em; margin: 40px 0 12px; font-weight: 600; }
h2 { font-size: 18px; margin: 0 0 6px; font-weight: 600; }
.lede { color: var(--muted); margin: 0 0 28px; max-width: 58ch; }

.card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
@media (max-width: 420px) { .card { padding: 16px; } }

label { display: block; font-weight: 500; margin-bottom: 8px; }
.row { display: flex; gap: 10px; }
input[type="text"] {
  flex: 1; min-width: 0; height: 48px; padding: 0 14px;
  background: var(--bg); color: var(--text);
  border: 1px solid var(--border); border-radius: var(--radius);
  font: 400 15px var(--mono);
}
input::placeholder { color: #7B8086; }
input:focus-visible { outline-offset: 0; border-color: var(--text); }
button {
  height: 48px; padding: 0 24px; border: 1px solid var(--text); border-radius: var(--radius);
  background: #FFFFFF; color: var(--bg); font: 600 15px var(--sans); cursor: pointer;
}
button:hover:not(:disabled) { background: var(--text); }
button:disabled { cursor: progress; background: var(--card); color: var(--muted); border-color: var(--border); }
@media (max-width: 520px) { .row { flex-direction: column; } input[type="text"] { flex: none; } button { width: 100%; } }
.hint { color: var(--muted); font-size: 14px; margin: 10px 0 0; }
.cf-turnstile { margin-top: 12px; }

#result:not(:empty) { margin-top: 16px; }
.badge {
  display: inline-block; padding: 3px 12px; border-radius: 999px; font-size: 14px; font-weight: 600;
  border: 1px solid var(--muted); color: var(--text);
}
.badge.changed { background: #FFFFFF; color: var(--bg); border-color: #FFFFFF; }
.badge.unchanged, .badge.baseline { border-color: var(--border); background: var(--bg); }
.badge.blocked, .badge.error, .badge.rate_limited, .badge.no_credits, .badge.paced, .badge.invalid { border-style: dashed; color: var(--muted); }
.target { margin: 12px 0 4px; font: 400 14px var(--mono); color: var(--muted); overflow-wrap: anywhere; }
.msg { margin: 8px 0 0; }
.meta { display: flex; flex-wrap: wrap; gap: 4px 20px; margin: 14px 0 0; padding: 0; list-style: none; color: var(--muted); font-size: 14px; }
.meta b { color: var(--text); font-weight: 500; }

pre {
  margin: 14px 0 0; padding: 14px; overflow-x: auto;
  background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius);
  font: 400 13px/1.6 var(--mono); tab-size: 2;
}
.diff { padding: 8px 0; }
.diff span { display: block; padding: 1px 14px; white-space: pre-wrap; overflow-wrap: anywhere; }
.diff .add { background: var(--add-bg); color: var(--text); font-weight: 500; box-shadow: inset 3px 0 0 var(--text); }
.diff .del { color: var(--del); text-decoration: line-through; text-decoration-thickness: 1px; }
.diff .more { color: var(--muted); font-style: italic; }
code { font-family: var(--mono); }

.run { margin-top: 16px; }
.run p { color: var(--muted); margin: 0 0 4px; }
.run .links { margin: 16px 0 0; display: flex; flex-wrap: wrap; gap: 8px 24px; }
footer { color: var(--muted); font-size: 13px; margin-top: 28px; }

@media (prefers-reduced-motion: no-preference) {
  button:disabled { animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.6; } }
}
</style>
<!--BEACON-->
</head>
<body>
<div class="wrap">
  <header>
    <a class="brand" href="/" aria-label="Spicrawl change monitor">Spicrawl</a>
    <span class="sub">&middot; Change monitor</span>
    <a class="gh" href="${REPO_URL}">GitHub</a>
  </header>

  <main>
    <h1>Did that page change?</h1>
    <p class="lede">Paste a URL and check it. The first check saves a baseline. Check the same URL again later and you get the lines that were added or removed.</p>

    <form class="card" id="form" novalidate>
      <label for="url">Page URL</label>
      <div class="row">
        <input id="url" name="url" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="2048" placeholder="https://example.com" aria-describedby="hint">
        <button type="submit" id="go">Check</button>
      </div>
      <!--TURNSTILE-->
      <p class="hint" id="hint">Public http(s) pages only. Limit: 5 checks per minute.</p>
    </form>

    <div id="result" aria-live="polite" aria-atomic="true"></div>

    <section class="card run" aria-labelledby="run-h">
      <h2 id="run-h">Run it yourself</h2>
      <p>The demo is the same code as the open-source CLI. Run it on your own URLs, on a schedule, with Discord or Slack alerts.</p>
      <pre><code>${RUN_COMMANDS}</code></pre>
      <p class="links">
        <a href="${REPO_URL}">Source on GitHub</a>
        <a href="${KEY_URL}">Get a free API key (1,000 credits/month)</a>
      </p>
    </section>

    <footer>
      Snapshots are kept for 7 days after the page last changed, keyed by URL and shared by everyone who checks the same URL. Do not check pages you consider private.
    </footer>
  </main>
</div>
<script nonce="__NONCE__">
(() => {
  const $ = (id) => document.getElementById(id);
  const form = $("form"), input = $("url"), go = $("go"), out = $("result");
  const LABEL = {
    baseline: "Baseline saved", unchanged: "Unchanged", changed: "Changed",
    blocked: "Blocked/unavailable", error: "Error", rate_limited: "Slow down",
    no_credits: "Demo out of credits", paced: "Busy today", invalid: "Check the URL",
  };
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const when = (iso) => (iso ? new Date(iso).toLocaleString() : "the last check");

  function summary(d) {
    if (d.status === "baseline") return "Saved as the baseline. Check this URL again later to see what changed.";
    if (d.status === "unchanged") return "The content matches the snapshot from " + when(d.previousCheckedAt) + ".";
    if (d.status === "changed") return "+" + d.diff.added + " -" + d.diff.removed + " lines since the snapshot from " + when(d.previousCheckedAt) + ".";
    if (d.status === "blocked") return (d.targetStatus ? "The site answered with HTTP " + d.targetStatus + ". Nothing was saved; your last good snapshot is untouched. " : "") + (d.message || "");
    return d.message || "Something went wrong.";
  }

  function render(d) {
    const card = el("section", "card");
    card.append(el("span", "badge " + d.status, LABEL[d.status] || "Error"));
    if (d.url) card.append(el("p", "target", d.url));
    card.append(el("p", "msg", summary(d)));

    if (d.status === "changed") {
      const pre = el("pre", "diff");
      const lines = d.diff.text ? d.diff.text.split("\\n") : ["(only line order or blank lines changed)"];
      for (const line of lines) {
        const cls = line.startsWith("+ ") ? "add" : line.startsWith("- ") ? "del" : "more";
        pre.append(el("span", cls, line));
      }
      card.append(pre);
    }
    if (d.commands) card.append(el("pre", "", d.commands));

    const meta = el("ul", "meta");
    const item = (k, v) => {
      const li = el("li", "", k + ": ");
      li.append(el("b", "", v));
      meta.append(li);
    };
    if (typeof d.credits === "number") item("Credits used", String(d.credits));
    if (d.engine) item("Engine", d.engine);
    if (d.targetStatus) item("Target HTTP", String(d.targetStatus));
    if (meta.children.length) card.append(meta);
    out.replaceChildren(card);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = input.value.trim();
    if (!url) {
      render({ status: "invalid", message: "Enter a URL to check." });
      input.focus();
      return;
    }
    go.disabled = true;
    go.textContent = "Checking...";
    out.setAttribute("aria-busy", "true");
    const token = new FormData(form).get("cf-turnstile-response"); // only present when Turnstile is on
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, turnstile: token || undefined }),
      });
      let data;
      try { data = await res.json(); } catch { data = { status: "error", message: "Unexpected response from the demo (HTTP " + res.status + ")." }; }
      render(data);
    } catch {
      render({ status: "error", message: "Could not reach the demo. Check your connection and try again." });
    } finally {
      if (window.turnstile) window.turnstile.reset(); // a token works once
      go.disabled = false;
      go.textContent = "Check";
      out.removeAttribute("aria-busy");
    }
  });
})();
</script>
</body>
</html>
`;
