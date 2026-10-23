#!/usr/bin/env node
// Site change monitor: scrape a list of URLs with Spicrawl, compare each page with the
// last snapshot, and alert (console, Discord, Slack) when the content changed.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { Spicrawl, isSpicrawlError, InsufficientCreditsError, AuthenticationError } from "@spicrawl/sdk";

const USAGE = `Usage: node monitor.mjs [options] [url ...]

  -f, --file <path>    URL list, one per line, '#' starts a comment (default: urls.txt)
  -s, --state <path>   snapshot file (default: .monitor-state.json)
  -e, --every <time>   keep running, e.g. 30s, 15m, 1h (default: run once and exit)
  -h, --help

URLs given as arguments are used instead of the file.
Env: SPICRAWL_API_KEY (required), DISCORD_WEBHOOK_URL, SLACK_WEBHOOK_URL`;

const MISSING_KEY = `SPICRAWL_API_KEY is not set.
Get a free API key (1,000 credits/month) at https://app.spicrawl.com, then:
  export SPICRAWL_API_KEY=spicrawl_live_...`;

// --- diff ---------------------------------------------------------------------------

export function diffLines(before, after, maxLines = 20) {
  // ponytail: set difference of lines, so moved or duplicated lines are invisible and the
  // output is not in page order. Swap in a real LCS diff (e.g. the `diff` package) if that matters.
  const lines = (s) => s.split("\n").map((l) => l.trimEnd()).filter(Boolean);
  const [a, b] = [lines(before), lines(after)];
  const [inA, inB] = [new Set(a), new Set(b)];
  const removed = a.filter((l) => !inB.has(l));
  const added = b.filter((l) => !inA.has(l));
  const all = [...removed.map((l) => `- ${l}`), ...added.map((l) => `+ ${l}`)].map((l) => l.slice(0, 200));
  const shown = all.slice(0, maxLines);
  if (all.length > maxLines) shown.push(`... ${all.length - maxLines} more lines`);
  return { added: added.length, removed: removed.length, text: shown.join("\n") };
}

// --- state --------------------------------------------------------------------------

function loadState(path) {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`Cannot read ${path} (${err.message}). Fix it or delete it to start over.`);
  }
}

function saveState(path, state) {
  // Write then rename, so a crash never leaves a half-written state file.
  writeFileSync(`${path}.tmp`, JSON.stringify(state, null, 2));
  renameSync(`${path}.tmp`, path);
}

// --- core ---------------------------------------------------------------------------

function describe(err) {
  if (err instanceof AuthenticationError) {
    return "Spicrawl rejected the API key. Check SPICRAWL_API_KEY, or get a free key at https://app.spicrawl.com";
  }
  if (err instanceof InsufficientCreditsError) {
    return "Out of credits. The free plan has 1,000 credits/month; see https://app.spicrawl.com";
  }
  if (isSpicrawlError(err)) {
    // The SDK already appends " [code]" to the message when the API sent one.
    const text = err.message.includes(err.code) ? err.message : `${err.message} [${err.code}]`;
    return [text, err.diagnostics?.hint && `Hint: ${err.diagnostics.hint}`].filter(Boolean).join(" ");
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Scrape every URL once and compare with the saved snapshot.
 * Result statuses: baseline | unchanged | changed | blocked | error.
 * `onResult` runs after each URL, before its snapshot is saved, so an alert is never lost.
 */
export async function runOnce({ spicrawl, urls, statePath, onResult = () => {} }) {
  const state = loadState(statePath);
  const results = [];
  let credits = 0;
  for (const url of urls) {
    let result;
    let snapshot; // only set for a good page; blocked and failed URLs leave the state alone
    try {
      const page = await spicrawl.scrapeRaw({
        url,
        response_format: "markdown",
        main_content_only: true,
        mode: "auto",
        cache: false, // a cached copy (default TTL 48h) would hide changes
      });
      credits += page._meta.creditsCharged ?? 0;
      if (page.targetStatus >= 400) {
        // The call succeeded but the site refused or failed: the body is a block/error page.
        result = { url, status: "blocked", targetStatus: page.targetStatus };
      } else {
        const content = page.body.trim();
        const hash = createHash("sha256").update(content).digest("hex");
        const prev = state[url];
        result = { url, status: !prev ? "baseline" : prev.hash === hash ? "unchanged" : "changed" };
        if (result.status === "changed") result.diff = diffLines(prev.content, content);
        snapshot = { hash, content, checkedAt: new Date().toISOString() };
      }
    } catch (err) {
      // A bad key or empty balance fails every remaining URL too, so stop. Anything else is per-URL.
      if (!isSpicrawlError(err) || err instanceof AuthenticationError || err instanceof InsufficientCreditsError) {
        throw err;
      }
      result = { url, status: "error", message: describe(err) };
    }
    await onResult(result);
    if (snapshot) {
      state[url] = snapshot;
      saveState(statePath, state);
    }
    results.push(result);
  }
  return { results, credits };
}

// --- output -------------------------------------------------------------------------

export function formatResult({ status, url, diff, targetStatus, message }) {
  if (status === "baseline") return `Baseline saved: ${url}`;
  if (status === "unchanged") return `Unchanged: ${url}`;
  if (status === "blocked") {
    return `Blocked/unavailable: ${url} (target returned HTTP ${targetStatus}; snapshot left as it was)`;
  }
  if (status === "error") return `Error: ${url} - ${message}`;
  const body = diff.text || "(only line order or blank lines changed)";
  return `Changed: ${url} (+${diff.added} -${diff.removed} lines)\n${body}`;
}

/** POST to Discord and/or Slack when their webhook URL is set. Never throws. */
export async function sendWebhooks(text, env = process.env) {
  const hooks = [
    [env.DISCORD_WEBHOOK_URL, { content: text.slice(0, 1900) }], // Discord caps content at 2000 chars
    [env.SLACK_WEBHOOK_URL, { text }],
  ];
  for (const [url, body] of hooks) {
    if (!url) continue;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) console.error(`Webhook failed: HTTP ${res.status}`);
    } catch (err) {
      console.error(`Webhook failed: ${err.message}`); // the URL is a secret, so it is not printed
    }
  }
}

// --- cli ----------------------------------------------------------------------------

export function parseInterval(text) {
  const m = /^([1-9]\d*)([smh])$/.exec(text);
  if (!m) throw new Error(`Bad --every value "${text}". Use a number and s, m or h, e.g. 30s, 15m, 1h.`);
  return Number(m[1]) * { s: 1000, m: 60_000, h: 3_600_000 }[m[2]];
}

function readUrls(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      file: { type: "string", short: "f", default: "urls.txt" },
      state: { type: "string", short: "s", default: ".monitor-state.json" },
      every: { type: "string", short: "e" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) return console.log(USAGE);

  const urls = [...new Set(positionals.length ? positionals : readUrls(values.file))];
  if (!urls.length) throw new Error(`No URLs. Pass them as arguments or list them in ${values.file}.\n\n${USAGE}`);
  const everyMs = values.every ? parseInterval(values.every) : 0;
  if (!process.env.SPICRAWL_API_KEY) throw new Error(MISSING_KEY);

  const spicrawl = new Spicrawl(); // reads SPICRAWL_API_KEY
  const onResult = async (result) => {
    const text = formatResult(result);
    console.log(text);
    if (result.status === "changed") await sendWebhooks(text);
  };

  let failed = false;
  for (;;) {
    console.log(`\n[${new Date().toISOString()}] Checking ${urls.length} URL(s)`);
    const { results, credits } = await runOnce({ spicrawl, urls, statePath: values.state, onResult });
    console.log(`Credits used this run: ${credits}`);
    failed = results.some((r) => r.status === "error");
    if (!everyMs) break;
    await new Promise((resolve) => setTimeout(resolve, everyMs));
  }
  if (failed) process.exitCode = 1; // run-once mode: let cron / CI see that a URL failed
}

// Run only when executed (also through the npm bin symlink), not when imported by the test.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch((err) => {
    console.error(`Error: ${describe(err)}`);
    process.exitCode = 1;
  });
}
