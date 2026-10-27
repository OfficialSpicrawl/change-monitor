// Live demo: GET / serves the page, POST /api/check scrapes one URL with Spicrawl and
// compares it with the snapshot kept in Workers KV. Same scrape call and diff as monitor.mjs.
import { createHash, randomUUID } from "node:crypto";
import {
  Spicrawl,
  isSpicrawlError,
  AuthenticationError,
  PermissionDeniedError,
  InsufficientCreditsError,
  RateLimitError,
  APITimeoutError,
  APIConnectionError,
} from "@spicrawl/sdk";
import { openpanelCsp, openpanelTag } from "./openpanel.mjs";
import { diffLines } from "../../monitor.mjs";
import { LLMS_TXT, NOT_FOUND, PAGE, RUN_COMMANDS } from "./page.mjs";

const MIN_CREDITS = 100; // below this the demo stops scraping and points people at the CLI
const PACE_SLACK = 0.05; // a day's spend may run this share of the monthly limit ahead of an even pace
const MAX_COST = 1; // credits one check may cost; Spicrawl refuses anything dearer before it runs, at 0 credits
const MAX_BODY = 4096;
const SUMMARY_KEY = "https://cache.internal/usage-summary"; // synthetic: only ever a Cache API key, never fetched
const SUMMARY_TTL = 60;
const SNAPSHOT_TTL = 7 * 24 * 3600;
const TURNSTILE_API = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
// ponytail: only the first 200 KB of a page is stored and compared, so a change past it is invisible.
const MAX_CONTENT = 200_000;
const PRIVATE_SUFFIX = /(^|\.)(local|localhost|internal|localdomain|lan|home\.arpa)$/;
const ERROR_CODE = /^ERR::[A-Z_]+::[A-Z_]+$/; // the only part of a Spicrawl error a visitor is shown
const SECURITY = { "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" };

const csp = (nonce, turnstile, op = { script: "", connect: "" }) =>
  [
    "default-src 'none'",
    // 'self' is the page's own bundle (/app.js and its chunks, served as static assets); inline code still needs the nonce.
    `script-src 'nonce-${nonce}' 'self' https://static.cloudflareinsights.com${turnstile ? " https://challenges.cloudflare.com" : ""}${op.script}`,
    `style-src 'nonce-${nonce}'`,
    "font-src 'self'", // Geist and Geist Mono, served from /fonts
    "img-src 'self' data:", // the wordmark, and the inline favicon
    // api.github.com: the star count on the "Star on GitHub" buttons.
    `connect-src 'self' https://cloudflareinsights.com https://api.github.com${op.connect}`,
    ...(turnstile ? ["frame-src https://challenges.cloudflare.com"] : []),
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY, "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
// A failed check: `http` is the response status, `status` the outcome shown in the UI and logged.
const fail = (http, status, message, extra = {}, headers = {}) => ({ http, body: { status, message, ...extra }, headers });
const noCredits = () =>
  fail(503, "no_credits", "The demo has used its credits for this month — run it yourself with a free key", {
    commands: RUN_COMMANDS,
  });
const paced = () =>
  fail(503, "paced", "Today's share of the demo's credits is used up. Try again tomorrow, or run it yourself with a free key.", {
    commands: RUN_COMMANDS,
  });
// The demo makes one basic request. A site that needs more (or refuses it) gets the CLI, which escalates.
const blocked = (base = {}, code = "") => ({
  http: 200,
  body: {
    status: "blocked",
    message: `The demo makes one basic request and this site needs more than that: it blocks automated fetches, needs a browser, or is down${code ? ` (${code})` : ""}. The CLI escalates automatically; run it yourself:`,
    commands: RUN_COMMANDS,
    ...base,
  },
  headers: {},
});

/** The rate-limit key. An IPv6 visitor controls a whole /64, so key on its first four groups, expanded so `::` cannot hide them. */
export function ipKey(ip) {
  if (!ip.includes(":") || ip.includes(".")) return ip; // IPv4, "unknown", or IPv4-mapped IPv6: the address itself
  const [head, tail] = ip.split("::");
  const a = head ? head.split(":") : [];
  const b = tail ? tail.split(":") : [];
  const groups = tail === undefined ? a : [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b];
  return groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, "")).join(":");
}

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
  const host = url.hostname.replace(/\.+$/, "").toLowerCase().slice(0, 100);
  if (url.protocol !== "http:" && url.protocol !== "https:") return { error: "Only http:// and https:// URLs can be checked.", host };
  if (url.username || url.password) return { error: "URLs with a username or password are not allowed.", host };
  // new URL() has already turned 2130706433 or 0x7f.1 into 127.0.0.1, so one digits-and-dots test covers every IPv4 form.
  if (host.startsWith("[") || /^[\d.]+$/.test(host) || !host.includes(".") || PRIVATE_SUFFIX.test(host)) {
    return { error: "Private, local and IP-address hosts can't be checked. Use the address of a public website.", host };
  }
  url.hash = "";
  return { url: url.href, host };
}

/** The demo key's allowance (micro-credits, window ends in ms), null when unlimited. Cached for a minute. */
async function allowanceOf(spicrawl, ctx) {
  const hit = await caches.default.match(SUMMARY_KEY);
  if (hit) return (await hit.json()).allowance;
  const { allowance: a } = await spicrawl.usage.summary();
  const allowance = a?.unlimited
    ? null
    : a && { limit: a.limit_micro, left: a.remaining_micro, start: Date.parse(a.window_start), end: Date.parse(a.resets_at) };
  const copy = new Response(JSON.stringify({ allowance }), { headers: { "cache-control": `max-age=${SUMMARY_TTL}` } });
  ctx.waitUntil(caches.default.put(SUMMARY_KEY, copy).catch(() => {}));
  return allowance;
}

/** null to go ahead, else the refusal: under MIN_CREDITS left, or spending ahead of an even pace over the allowance month. Anything unreadable fails closed. */
export function creditGate(a, now = Date.now()) {
  if (a === null) return null; // unlimited allowance: nothing to pace against
  const left = Math.floor(a?.left / 1e6);
  if (!(left >= MIN_CREDITS)) return noCredits();
  // NaN (a missing or garbled window) is not finite, so it lands in the refusal as well.
  const elapsed = (now - a.start) / (a.end - a.start);
  if (!Number.isFinite(elapsed)) return paced();
  const used = a.limit - a.left;
  if (!(used <= a.limit * (Math.min(1, Math.max(0, elapsed)) + PACE_SLACK))) return paced();
  return null;
}

/** null when the Turnstile token checks out, else the refusal. Only called when Turnstile is configured. */
async function turnstileRefusal(env, token, ip) {
  if (typeof token !== "string" || !token || token.length > 2048) {
    return fail(403, "invalid", "Complete the verification above the Check button, then try again.");
  }
  try {
    const res = await fetch(TURNSTILE_API, {
      method: "POST",
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, ...(ip && { remoteip: ip }) }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if ((await res.json()).success === true) return null;
  } catch (err) {
    console.error("turnstile verify failed:", err?.name); // never the message: it could echo the secret
    return fail(503, "error", "Could not run the verification check. Try again in a moment.");
  }
  return fail(403, "invalid", "The verification failed or expired. Complete it again and retry.");
}

/** The Turnstile site key, or "" when Turnstile is off (it needs both the key and the secret). */
const turnstileKey = (env) => (env.TURNSTILE_SECRET ? String(env.TURNSTILE_SITE_KEY || "").replace(/[^\w-]/g, "") : "");

async function check(request, env, ctx, ev) {
  const ip = request.headers.get("cf-connecting-ip") || "";
  if (env.LIMITER) {
    const { success } = await env.LIMITER.limit({ key: ipKey(ip || "unknown") });
    if (!success) {
      return fail(429, "rate_limited", "Too many checks from your address. The demo allows 5 per minute; try again in a minute.", {}, { "retry-after": "60" });
    }
  }

  // JSON only: a cross-site <form> post cannot send it, so other sites cannot spend the demo's credits.
  // A numeric Content-Length is required, so a chunked body cannot skip the size check.
  const declared = request.headers.get("content-length");
  if (declared === null || !/^\d+$/.test(declared)) return fail(411, "invalid", "Send the request with a Content-Length header.");
  if (Number(declared) > MAX_BODY) return fail(413, "invalid", "That request is too large.");
  const jsonBody = /^application\/json/i.test(request.headers.get("content-type") || "");
  const input = jsonBody ? await request.json().catch(() => null) : null;
  const target = parseTarget(input?.url);
  ev.host = target.host ?? "";
  if (target.error) return fail(400, "invalid", target.error);
  if (turnstileKey(env)) {
    const refusal = await turnstileRefusal(env, input?.turnstile, ip);
    if (refusal) return refusal;
  }

  const spicrawl = new Spicrawl({
    apiKey: env.SPICRAWL_API_KEY,
    fetch: (...args) => fetch(...args), // not the bare global: the SDK would call it with itself as `this`
    maxRetries: 0,
    timeoutMs: 45_000,
  });
  const refusal = creditGate(await allowanceOf(spicrawl, ctx));
  if (refusal) return refusal;

  const url = target.url;
  const key = sha256(url);
  const prior = await env.SNAPSHOTS.get(key, "json"); // before the scrape, so a KV outage costs no credits
  const page = await spicrawl.scrapeRaw({
    url,
    response_format: "markdown",
    main_content_only: true,
    // Demo only: one plain fetch, no escalation to the dearer browser engines (the CLI uses mode:"auto").
    // max_cost caps the check; Spicrawl picks the engine itself and ignores an engine field, and a site that needs more fails at 0 credits.
    max_cost: MAX_COST,
    cache: false, // a cached copy would hide changes
  });
  ev.credits = page._meta.creditsCharged ?? 0;
  // No engine field: which engine Spicrawl picked is internal and is never shown to visitors.
  const base = { url, credits: ev.credits, targetStatus: page.targetStatus };

  // Only a 200 is a page worth keeping. Anything else (a block page, an outage, a 202/206 that Spicrawl may bill at 0)
  // leaves the last good snapshot alone.
  if (page.targetStatus !== 200) return blocked(base);

  const content = page.body.trim().slice(0, MAX_CONTENT);
  const hash = sha256(content);
  // Unchanged pages are not rewritten: it saves KV writes (and its 1 write/s/key limit). A failed write loses only the snapshot.
  if (prior?.hash !== hash) {
    try {
      await env.SNAPSHOTS.put(key, JSON.stringify({ hash, content, checkedAt: new Date().toISOString() }), {
        expirationTtl: SNAPSHOT_TTL,
      });
    } catch (err) {
      console.error("snapshot write failed:", err?.name);
    }
  }
  if (!prior) return { http: 200, body: { status: "baseline", ...base } };
  const body = { ...base, previousCheckedAt: prior.checkedAt };
  if (prior.hash === hash) return { http: 200, body: { status: "unchanged", ...body } };
  return { http: 200, body: { status: "changed", ...body, diff: diffLines(prior.content, content) } };
}

/** Turn anything thrown into a friendly reply: fixed wording plus, for Spicrawl errors, the error code. Never the raw message. */
function describe(err, apiKey) {
  const scrub = (s) => (apiKey ? String(s).split(apiKey).join("[redacted]") : String(s));
  console.error("check failed:", err?.name, err?.code ?? "", scrub(err?.message));
  const code = isSpicrawlError(err) && ERROR_CODE.test(err.code) ? err.code : "";
  if (err instanceof AuthenticationError || err instanceof PermissionDeniedError || err?.code === "ERR::AUTH::MISSING_KEY") {
    return fail(502, "error", "The demo's Spicrawl API key was rejected. That is our problem, not yours; please try again later.");
  }
  if (err instanceof InsufficientCreditsError) return noCredits();
  if (err instanceof RateLimitError) return fail(503, "error", "Spicrawl is rate limiting the demo right now. Try again in a minute.");
  if (err instanceof APITimeoutError) return fail(504, "error", "The page took too long to scrape. Try a lighter page.");
  if (err instanceof APIConnectionError) return fail(502, "error", "Could not reach the Spicrawl API. Try again in a moment.");
  if (isSpicrawlError(err)) {
    // A site that costs more than MAX_COST, or that refuses a plain request, is the "use the CLI" case.
    if (code === "ERR::LIMIT::MAX_COST_EXCEEDED" || /^ERR::(UPSTREAM|PROXY|ENGINE|EXTRACT)::/.test(code)) return blocked({}, code);
    const tag = code ? ` (${code})` : "";
    if (err.status === 400 || /^ERR::(SECURITY|REQUEST)::/.test(code)) {
      return fail(400, "invalid", `Spicrawl could not accept that URL. Check that it is a public web page${tag}.`);
    }
    return fail(502, "error", `Spicrawl could not complete the check. Try again in a moment${tag}.`);
  }
  return fail(500, "error", "Something went wrong on our side. Please try again.");
}

/** The designed 404: styled like the page, no script. */
function notFound() {
  const nonce = btoa(randomUUID());
  return new Response(NOT_FOUND.replaceAll("__NONCE__", () => nonce), {
    status: 404,
    headers: {
      ...SECURITY,
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
      "content-security-policy": `default-src 'none'; style-src 'nonce-${nonce}'; font-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    },
  });
}

function page(env) {
  const clean = (v) => String(v || "").replace(/[^\w-]/g, "");
  const token = clean(env.BEACON_TOKEN);
  const siteKey = turnstileKey(env);
  const nonce = btoa(randomUUID()); // per response: the inline script and style run only with this
  const beacon = token
    ? `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${token}"}'></script>`
    : "";
  const api = siteKey ? `<script async defer src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>` : "";
  const widget = siteKey ? `<div class="cf-turnstile" data-sitekey="${siteKey}" data-theme="dark"></div>` : "";
  const html = PAGE.replace("<!--BEACON-->", () => beacon + api + openpanelTag(env, nonce, "change-monitor"))
    .replace("<!--TURNSTILE-->", () => widget)
    .replaceAll("__NONCE__", () => nonce);
  return new Response(html, {
    headers: {
      ...SECURITY,
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache", // the nonce is per response, so a shared cache must not replay it
      "content-security-policy": csp(nonce, Boolean(siteKey), openpanelCsp(env)),
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/") {
      if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { ...SECURITY, allow: "GET, HEAD" } });
      return page(env);
    }
    if (pathname === "/llms.txt") {
      if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { ...SECURITY, allow: "GET, HEAD" } });
      return new Response(LLMS_TXT, { headers: { ...SECURITY, "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
    }
    if (pathname !== "/api/check") {
      return request.method === "GET" || request.method === "HEAD" ? notFound() : new Response("Not found", { status: 404, headers: SECURITY });
    }
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
