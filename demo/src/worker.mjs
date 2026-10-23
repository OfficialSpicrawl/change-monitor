// Live demo: GET / serves the page, POST /api/check scrapes one URL with Spicrawl and
// compares it with the snapshot kept in Workers KV. Same scrape call and diff as monitor.mjs.
import { createHash } from "node:crypto";
import {
  Spicrawl,
  isSpicrawlError,
  AuthenticationError,
  InsufficientCreditsError,
  RateLimitError,
  APITimeoutError,
  APIConnectionError,
  BadRequestError,
} from "@spicrawl/sdk";
import { diffLines } from "../../monitor.mjs";
import { PAGE, RUN_COMMANDS } from "./page.mjs";

const MIN_CREDITS = 100; // below this the demo stops scraping and points people at the CLI
const SUMMARY_URL = "https://api.spicrawl.com/v1/usage/summary"; // also the Cache API key
const SUMMARY_TTL = 60;
const SNAPSHOT_TTL = 7 * 24 * 3600;
// ponytail: only the first 200 KB of a page is stored and compared, so a change past it is invisible.
const MAX_CONTENT = 200_000;
const PRIVATE_SUFFIX = /\.(local|localhost|internal|localdomain|lan)$/;
const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https://static.cloudflareinsights.com",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src data:",
  "connect-src 'self' https://cloudflareinsights.com",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
// A failed check: `http` is the response status, `status` the outcome shown in the UI and logged.
const fail = (http, status, message, extra = {}, headers = {}) => ({ http, body: { status, message, ...extra }, headers });
const noCredits = () =>
  fail(503, "no_credits", "The demo has used its credits for this month — run it yourself with a free key", {
    commands: RUN_COMMANDS,
  });

/** Validate what the visitor typed. Returns { url, host } or { error, host? }. */
export function parseTarget(raw) {
  if (typeof raw !== "string" || !raw.trim()) return { error: "Enter a URL to check." };
  let text = raw.trim();
  if (text.length > 2048) return { error: "That URL is too long (2048 characters at most)." };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`; // "example.com" works
  let url;
  try {
    url = new URL(text);
  } catch {
    return { error: "That does not look like a valid URL." };
  }
  const host = url.hostname.replace(/\.$/, "").toLowerCase().slice(0, 100);
  if (url.protocol !== "http:" && url.protocol !== "https:") return { error: "Only http:// and https:// URLs can be checked.", host };
  if (url.username || url.password) return { error: "URLs with a username or password are not allowed.", host };
  // new URL() has already turned 2130706433 or 0x7f.1 into 127.0.0.1, so one digits-and-dots test covers every IPv4 form.
  if (host.startsWith("[") || /^[\d.]+$/.test(host) || !host.includes(".") || PRIVATE_SUFFIX.test(host)) {
    return { error: "Private, local and IP-address hosts can't be checked. Use the address of a public website.", host };
  }
  url.hash = "";
  return { url: url.href, host };
}

/** Credits left this month, or null when unlimited or unknown. Cached for a minute. */
async function creditsLeft(spicrawl, ctx) {
  const hit = await caches.default.match(SUMMARY_URL);
  if (hit) return (await hit.json()).remaining;
  const { allowance } = await spicrawl.usage.summary();
  const remaining = allowance && !allowance.unlimited ? Math.floor(allowance.remaining_micro / 1e6) : null;
  const copy = new Response(JSON.stringify({ remaining }), { headers: { "cache-control": `max-age=${SUMMARY_TTL}` } });
  ctx.waitUntil(caches.default.put(SUMMARY_URL, copy));
  return remaining;
}

async function check(request, env, ctx, ev) {
  if (env.LIMITER) {
    const { success } = await env.LIMITER.limit({ key: request.headers.get("cf-connecting-ip") || "unknown" });
    if (!success) {
      return fail(429, "rate_limited", "Too many checks from your address. The demo allows 5 per minute; try again in a minute.", {}, { "retry-after": "60" });
    }
  }

  // JSON only: a cross-site <form> post cannot send it, so other sites cannot spend the demo's credits.
  const jsonBody = /^application\/json/i.test(request.headers.get("content-type") || "");
  const input = jsonBody && Number(request.headers.get("content-length")) < 4096 ? await request.json().catch(() => null) : null;
  const target = parseTarget(input?.url);
  ev.host = target.host ?? "";
  if (target.error) return fail(400, "invalid", target.error);

  const spicrawl = new Spicrawl({
    apiKey: env.SPICRAWL_API_KEY,
    fetch: (...args) => fetch(...args), // not the bare global: the SDK would call it with itself as `this`
    maxRetries: 0,
    timeoutMs: 45_000,
  });
  const remaining = await creditsLeft(spicrawl, ctx);
  if (remaining !== null && remaining < MIN_CREDITS) return noCredits();

  const url = target.url;
  const key = sha256(url);
  const prior = await env.SNAPSHOTS.get(key, "json"); // before the scrape, so a KV outage costs no credits
  const page = await spicrawl.scrapeRaw({
    url,
    response_format: "markdown",
    main_content_only: true,
    mode: "auto",
    cache: false, // a cached copy would hide changes
  });
  ev.credits = page._meta.creditsCharged ?? 0;
  const base = { url, credits: ev.credits, engine: page._meta.engine, targetStatus: page.targetStatus };

  // The site answered but refused or failed: the body is a block page, so keep the last good snapshot.
  if (page.targetStatus >= 400) return { http: 200, body: { status: "blocked", ...base } };

  const content = page.body.trim().slice(0, MAX_CONTENT);
  const hash = sha256(content);
  await env.SNAPSHOTS.put(key, JSON.stringify({ hash, content, checkedAt: new Date().toISOString() }), {
    expirationTtl: SNAPSHOT_TTL,
  });
  if (!prior) return { http: 200, body: { status: "baseline", ...base } };
  const body = { ...base, previousCheckedAt: prior.checkedAt };
  if (prior.hash === hash) return { http: 200, body: { status: "unchanged", ...body } };
  return { http: 200, body: { status: "changed", ...body, diff: diffLines(prior.content, content) } };
}

/** Turn anything thrown into a friendly reply. Never includes the API key. */
function describe(err, apiKey) {
  const scrub = (s) => (apiKey ? String(s).split(apiKey).join("[redacted]") : String(s));
  console.error("check failed:", err?.name, err?.code ?? "", scrub(err?.message));
  if (err instanceof AuthenticationError || err?.code === "ERR::AUTH::MISSING_KEY") {
    return fail(502, "error", "The demo's Spicrawl API key was rejected. That is our problem, not yours; please try again later.");
  }
  if (err instanceof InsufficientCreditsError) return noCredits();
  if (err instanceof RateLimitError) return fail(503, "error", "Spicrawl is rate limiting the demo right now. Try again in a minute.");
  if (err instanceof APITimeoutError) return fail(504, "error", "The page took too long to scrape. Try a lighter page.");
  if (err instanceof APIConnectionError) return fail(502, "error", "Could not reach the Spicrawl API. Try again in a moment.");
  if (isSpicrawlError(err)) {
    // The API words its errors for humans, e.g. "url is not allowed [ERR::REQUEST::INVALID_URL]".
    const text = scrub(err.message.includes(err.code) ? err.message : `${err.message} [${err.code}]`);
    return err instanceof BadRequestError ? fail(400, "invalid", text) : fail(502, "error", text);
  }
  return fail(500, "error", "Something went wrong on our side. Please try again.");
}

function page(env) {
  const token = (env.BEACON_TOKEN || "").replace(/[^\w-]/g, "");
  const beacon = token
    ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${token}"}'></script>`
    : "";
  return new Response(PAGE.replace("<!--BEACON-->", () => beacon), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": CSP,
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/") {
      if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
      return page(env);
    }
    if (pathname !== "/api/check") return new Response("Not found", { status: 404 });
    if (request.method !== "POST") return json({ status: "error", message: "Use POST." }, 405, { allow: "POST" });

    const started = Date.now();
    const ev = { host: "", credits: 0 };
    let result;
    try {
      result = await check(request, env, ctx, ev);
    } catch (err) {
      result = describe(err, env.SPICRAWL_API_KEY);
    }
    env.EVENTS?.writeDataPoint({
      blobs: ["change-monitor", result.body.status, ev.host, request.cf?.country || ""],
      doubles: [ev.credits, Date.now() - started],
      indexes: ["change-monitor"],
    });
    return json(result.body, result.http, result.headers);
  },
};
