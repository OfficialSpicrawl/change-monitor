// Calls the Worker's fetch handler directly with a stubbed env (KV, rate limiter, Analytics
// Engine), a stubbed Cache API and a stubbed fetch for the Spicrawl API. No network, no key.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { beforeEach, test } from "node:test";
import worker, { creditGate, ipKey, parseTarget } from "../src/worker.mjs";

const KEY = "spicrawl_test_SECRET_do_not_leak";
const V1 = "# Pricing\n\nFree plan: $0\nPro plan: $20\n";
const V2 = "# Pricing\n\nFree plan: $0\nPro plan: $25\nNew: Team plan\n";
const sha = (s) => createHash("sha256").update(s).digest("hex");
const ENGINE_NAMES = /moli|chromium|chrome|camoufox|obscura|browserless|headful|headless|playwright|puppeteer/i;

let api; // what the stubbed Spicrawl API does next
let calls; // requests the stub saw
let kv, events, allowed, limiterKey, kvPuts, kvPutFails;
let seen; // every response body, to prove the key never leaks
const logged = []; // console.error lines
console.error = (...args) => logged.push(args.join(" "));

const reset = () => {
  api = {
    limitMicro: 1000e6,
    remainingMicro: 900e6,
    elapsed: 0.5, // how far through the allowance month the stub says we are
    unlimited: false,
    allowance: undefined, // set to replace the whole allowance object (or null to omit it)
    turnstile: { success: true }, // what siteverify answers; an Error is thrown, a number is an HTTP status
    summaryPatch: {}, // fields overwritten on the allowance, to make it malformed
    scrape: { body: V1, targetStatus: 200, engine: "fetch", credits: 1 },
    scrapeError: null, // [httpStatus, problem body]
    github: { stargazers_count: 12 }, // what the GitHub API answers for the star count; an Error is thrown
    githubStatus: 200,
  };
  calls = { summary: 0, scrape: [], turnstile: [], github: 0 };
  kv = new Map();
  kvPuts = 0;
  kvPutFails = false;
  events = [];
  allowed = true;
  seen = [];
  logged.length = 0;
};

const cacheStore = new Map();
globalThis.caches = {
  default: {
    match: async (url) => cacheStore.get(url)?.clone(),
    put: async (url, res) => void cacheStore.set(url, res),
  },
};

const DAY = 86_400_000;
globalThis.fetch = async (url, init) => {
  if (String(url) === "https://api.github.com/repos/OfficialSpicrawl/change-monitor") {
    calls.github++;
    if (api.github instanceof Error) throw api.github;
    return new Response(JSON.stringify(api.github), { status: api.githubStatus, headers: { "content-type": "application/json" } });
  }
  if (String(url) === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
    calls.turnstile.push(Object.fromEntries(init.body));
    if (api.turnstile instanceof Error) throw api.turnstile;
    if (typeof api.turnstile === "number") return new Response("nope", { status: api.turnstile });
    return new Response(JSON.stringify(api.turnstile), { headers: { "content-type": "application/json" } });
  }
  assert.equal(init.headers.Authorization, `Bearer ${KEY}`);
  if (String(url) === "https://api.spicrawl.com/v1/usage/summary") {
    calls.summary++;
    const start = Date.now() - api.elapsed * 30 * DAY;
    const allowance =
      api.allowance !== undefined
        ? api.allowance
        : {
            unlimited: api.unlimited,
            limit_micro: api.limitMicro,
            limit_credits: api.limitMicro / 1e6,
            remaining_micro: api.remainingMicro,
            window_start: new Date(start).toISOString(),
            resets_at: new Date(start + 30 * DAY).toISOString(),
            ...api.summaryPatch,
          };
    return new Response(JSON.stringify(allowance === null ? {} : { allowance }), { headers: { "content-type": "application/json" } });
  }
  assert.equal(String(url), "https://api.spicrawl.com/v1/scrape");
  calls.scrape.push(JSON.parse(init.body));
  if (api.scrapeError) {
    const [status, problem] = api.scrapeError;
    return new Response(JSON.stringify(problem), { status, headers: { "content-type": "application/problem+json" } });
  }
  const s = api.scrape;
  return new Response(s.body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "x-target-status": String(s.targetStatus),
      "x-credits-charged": String(s.credits),
      "x-engine": s.engine,
    },
  });
};

const makeEnv = (extra = {}) => ({
  SPICRAWL_API_KEY: KEY,
  BEACON_TOKEN: "",
  SNAPSHOTS: {
    get: async (k, type) => (kv.has(k) ? JSON.parse(kv.get(k).value) : null),
    put: async (k, value, opts) => {
      kvPuts++;
      if (kvPutFails) throw new Error("KV put failed: 429 Too Many Requests");
      kv.set(k, { value, opts });
    },
  },
  LIMITER: { limit: async ({ key }) => ((limiterKey = key), { success: allowed }) },
  EVENTS: { writeDataPoint: (p) => events.push(p) },
  ...extra,
});
const ctx = () => {
  const pending = [];
  return { waitUntil: (p) => pending.push(p), settle: () => Promise.all(pending) };
};

// A header set to null is left off, e.g. { "content-length": null } for a chunked request.
async function post(body, { env = makeEnv(), headers = {}, raw } = {}) {
  const c = ctx();
  const payload = raw ?? JSON.stringify(body);
  const sent = { "content-type": "application/json", "cf-connecting-ip": "203.0.113.9", "content-length": String(Buffer.byteLength(payload)), ...headers };
  for (const k of Object.keys(sent)) if (sent[k] === null) delete sent[k];
  const req = new Request("https://change-monitor.spicrawl.com/api/check", { method: "POST", headers: sent, body: payload });
  const res = await worker.fetch(req, env, c);
  await c.settle();
  const text = await res.text();
  seen.push(text);
  return { res, data: JSON.parse(text) };
}
const check = (url, opts) => post({ url }, opts);

beforeEach(() => {
  reset();
  cacheStore.clear();
});

test("GET / serves the page; the beacon appears only with a token", async () => {
  const get = async (env) => {
    const res = await worker.fetch(new Request("https://change-monitor.spicrawl.com/"), env, ctx());
    return { res, html: await res.text() };
  };
  const off = await get(makeEnv());
  assert.equal(off.res.status, 200);
  assert.match(off.res.headers.get("content-type"), /text\/html/);
  assert.equal((off.html.match(/<h1[ >]/g) || []).length, 1, "one h1");
  assert.match(off.html, /npx skills add OfficialSpicrawl\/change-monitor/);
  assert.match(off.html, /git clone https:\/\/github\.com\/OfficialSpicrawl\/change-monitor &amp;&amp; cd change-monitor &amp;&amp; npm install/, "the CLI install is in the HTML, not only in the script");
  assert.match(off.html, /node monitor\.mjs/);
  assert.match(off.html, /<a class="btn btn-solid" href="https:\/\/app\.spicrawl\.com" rel="noopener">Try Spicrawl free/);
  assert.equal((off.html.match(/<a class="btn btn-line star[^"]*" href="https:\/\/github\.com\/OfficialSpicrawl\/change-monitor"/g) || []).length, 2, "Star on GitHub in the header and at the end");
  assert.match(off.html, /<script type="module" src="\/app\.js"><\/script>/);
  assert.doesNotMatch(off.html, ENGINE_NAMES, "the page never names Spicrawl's internal engines");
  assert.doesNotMatch(off.html, /cloudflareinsights|<!--BEACON-->/);

  const on = await get(makeEnv({ BEACON_TOKEN: "abc123" }));
  assert.ok(on.html.includes(`<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "abc123"}'></script>`));
  const evil = await get(makeEnv({ BEACON_TOKEN: `x'><script>alert(1)</script>` }));
  assert.doesNotMatch(evil.html, /alert\(1\)/);
});

test("the star count is asked of GitHub once an hour, written into the page, and left out when 0 or unknown", async () => {
  const get = async () => {
    const c = ctx();
    const res = await worker.fetch(new Request("https://change-monitor.spicrawl.com/"), makeEnv(), c);
    await c.settle();
    assert.equal(res.status, 200);
    return res.text();
  };
  const counts = (html) => (html.match(/<span class="count">/g) || []).length;
  let html = await get();
  assert.equal(calls.github, 1);
  assert.equal(counts(html), 2, "the header button and the final one");
  assert.match(html, /<span class="count">12<\/span>/);
  assert.match(html, /aria-label="Star on GitHub, 12 stars"/);
  await get();
  assert.equal(calls.github, 1, "the second page view is served from the Cache API");

  cacheStore.clear();
  api.github = { stargazers_count: 1234 };
  assert.match(await get(), /<span class="count">1\.2k<\/span>/);
  cacheStore.clear();
  api.github = { stargazers_count: 1 };
  assert.match(await get(), /aria-label="Star on GitHub, 1 star"/);

  for (const answer of [{ stargazers_count: 0 }, { message: "rate limited" }, new Error("offline"), { stargazers_count: "many" }]) {
    cacheStore.clear();
    api.github = answer;
    api.githubStatus = answer.message ? 403 : 200;
    calls.github = 0;
    html = await get();
    assert.equal(counts(html), 0, JSON.stringify(answer));
    assert.match(html, /aria-label="Star on GitHub"/);
    assert.doesNotMatch(html, /<!--STAR_COUNT-->|__STAR_LABEL__/);
    await get();
    assert.equal(calls.github, 1, "a failure is not retried on every page view");
  }
});

test("routing: unknown path 404, wrong method 405", async () => {
  const run = (path, method) => worker.fetch(new Request(`https://x.test${path}`, { method }), makeEnv(), ctx());
  const lost = await run("/nope", "GET");
  assert.equal(lost.status, 404);
  assert.match(lost.headers.get("content-type"), /text\/html/);
  assert.match(await lost.text(), /<title>Page not found/, "a designed 404, not a bare line");
  assert.equal((await run("/nope", "POST")).status, 404);
  assert.equal((await run("/api/check", "GET")).status, 405);
  assert.equal((await run("/", "POST")).status, 405);
});

test("GET /llms.txt: the page's facts as plain text for agents", async () => {
  const get = (method = "GET") => worker.fetch(new Request("https://x.test/llms.txt", { method }), makeEnv(), ctx());
  const res = await get();
  const text = await res.text();
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^text\/plain/);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.match(text, /npx skills add OfficialSpicrawl\/change-monitor/);
  assert.match(text, /SPICRAWL_API_KEY/);
  assert.match(text, /DISCORD_WEBHOOK_URL/);
  assert.doesNotMatch(text, ENGINE_NAMES);
  assert.equal((await get("POST")).status, 405);
});

test("every response carries nosniff: page, JSON results, 404 and 405", async () => {
  const run = (path, method) => worker.fetch(new Request(`https://x.test${path}`, { method }), makeEnv(), ctx());
  const responses = [
    await run("/", "GET"),
    await run("/", "POST"),
    await run("/nope", "GET"),
    await run("/api/check", "GET"),
    (await check("https://example.com/")).res,
    (await check("")).res,
    (await check("https://example.com/", { headers: { "content-length": null } })).res,
  ];
  for (const res of responses) assert.equal(res.headers.get("x-content-type-options"), "nosniff", String(res.status));
});

test("CSP: a fresh nonce per response, no unsafe-inline, self-hosted fonts, the beacon still allowed", async () => {
  const get = async () => {
    const res = await worker.fetch(new Request("https://change-monitor.spicrawl.com/"), makeEnv({ BEACON_TOKEN: "abc123" }), ctx());
    return { csp: res.headers.get("content-security-policy"), html: await res.text(), res };
  };
  const [a, b] = [await get(), await get()];
  const nonceOf = (csp) => csp.match(/script-src 'nonce-([^']+)'/)[1];
  assert.notEqual(nonceOf(a.csp), nonceOf(b.csp));
  assert.doesNotMatch(a.csp, /unsafe-inline|unsafe-eval/);
  assert.match(a.csp, new RegExp(`style-src 'nonce-${nonceOf(a.csp).replace(/[+/=]/g, "\\$&")}'(;|$)`), "inline style only with the nonce");
  assert.match(a.csp, /script-src [^;]*'self'/, "the page's own bundle");
  assert.match(a.csp, /script-src [^;]*https:\/\/static\.cloudflareinsights\.com/);
  assert.match(a.csp, /font-src 'self'(;|$)/, "Geist is self-hosted");
  assert.doesNotMatch(a.csp, /googleapis|gstatic/, "no third-party font host");
  assert.match(a.csp, /connect-src 'self' https:\/\/cloudflareinsights\.com(;|$)/);
  assert.doesNotMatch(a.csp, /api\.github\.com/, "the Worker fetches the star count, the browser does not");
  assert.doesNotMatch(a.csp, /challenges\.cloudflare\.com/, "Turnstile is off");
  assert.equal(a.res.headers.get("cache-control"), "no-cache");
  // The nonce in the header is the one on the inline style. The only inline script is the JSON-LD data block, which the
  // browser never runs.
  const n = nonceOf(a.csp);
  assert.equal([...a.html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)].map((m) => m[0]).join(), `<script type="application/ld+json">`);
  assert.equal([...a.html.matchAll(/<style[^>]*>/g)].map((m) => m[0]).join(), `<style nonce="${n}">`);
  assert.doesNotMatch(a.html, /__NONCE__|\sstyle=|\sonclick=|javascript:/);
  assert.ok(!b.html.includes(n));
});

test("Turnstile is off unless both the site key and the secret are set", async () => {
  for (const [i, extra] of [{}, { TURNSTILE_SITE_KEY: "0x4AAA" }, { TURNSTILE_SECRET: "s3cret" }].entries()) {
    const res = await worker.fetch(new Request("https://change-monitor.spicrawl.com/"), makeEnv(extra), ctx());
    const html = await res.text();
    assert.doesNotMatch(html, /class="cf-turnstile"|challenges\.cloudflare/, JSON.stringify(extra));
    assert.doesNotMatch(res.headers.get("content-security-policy"), /challenges\.cloudflare/);
    const { data } = await check(`https://example.com/${i}`, { env: makeEnv(extra) });
    assert.equal(data.status, "baseline", "no token needed");
  }
  assert.equal(calls.turnstile.length, 0);
});

test("Turnstile on: widget on the page, CSP allows only what it needs, the token is verified before any scrape", async () => {
  const env = () => makeEnv({ TURNSTILE_SITE_KEY: "0x4AAA-key_1", TURNSTILE_SECRET: "s3cret" });
  const res = await worker.fetch(new Request("https://change-monitor.spicrawl.com/"), env(), ctx());
  const html = await res.text();
  const csp = res.headers.get("content-security-policy");
  assert.match(html, /<div class="cf-turnstile" data-sitekey="0x4AAA-key_1" data-theme="dark"><\/div>/);
  assert.match(html, /<script async defer src="https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js"><\/script>/);
  assert.match(csp, /script-src [^;]*https:\/\/challenges\.cloudflare\.com/);
  assert.match(csp, /frame-src https:\/\/challenges\.cloudflare\.com/);
  assert.doesNotMatch(csp, /unsafe-inline/);
  assert.ok(!html.includes("s3cret"), "the secret never reaches the page");

  // No token: refused, nothing scraped, no siteverify call.
  let r = await check("https://example.com/", { env: env() });
  assert.equal(r.res.status, 403);
  assert.equal(r.data.status, "invalid");
  assert.match(r.data.message, /verification/);
  for (const turnstile of [42, "", "x".repeat(2049), { a: 1 }]) {
    r = await post({ url: "https://example.com/", turnstile }, { env: env() });
    assert.equal(r.res.status, 403);
  }
  assert.equal(calls.turnstile.length, 0);
  assert.equal(calls.scrape.length, 0);

  // A token Cloudflare rejects.
  api.turnstile = { success: false, "error-codes": ["invalid-input-response"] };
  r = await post({ url: "https://example.com/", turnstile: "bad" }, { env: env() });
  assert.equal(r.res.status, 403);
  assert.match(r.data.message, /failed or expired/);
  assert.equal(calls.scrape.length, 0);

  // A good token: siteverify gets the secret, the token and the visitor's address, then the scrape runs.
  api.turnstile = { success: true };
  r = await post({ url: "https://example.com/", turnstile: "good-token" }, { env: env() });
  assert.equal(r.data.status, "baseline");
  assert.deepEqual(calls.turnstile.at(-1), { secret: "s3cret", response: "good-token", remoteip: "203.0.113.9" });
  assert.equal(calls.scrape.length, 1);

  // Invalid URLs are turned away before a token is spent.
  const before = calls.turnstile.length;
  r = await post({ url: "http://localhost/", turnstile: "good-token" }, { env: env() });
  assert.equal(r.res.status, 400);
  assert.equal(calls.turnstile.length, before);
});

test("Turnstile on: an unreachable or erroring siteverify fails closed", async () => {
  const env = makeEnv({ TURNSTILE_SITE_KEY: "k", TURNSTILE_SECRET: "s3cret" });
  for (const turnstile of [new Error("network down s3cret"), 500]) {
    api.turnstile = turnstile;
    const { res, data } = await post({ url: "https://example.com/", turnstile: "t" }, { env });
    assert.equal(res.status, 503);
    assert.equal(data.status, "error");
    assert.match(data.message, /verification check/);
  }
  assert.equal(calls.scrape.length, 0);
  assert.ok(seen.every((t) => !t.includes("s3cret")) && logged.every((l) => !l.includes("s3cret")));
});

test("lifecycle: baseline, unchanged, changed with diff", async () => {
  const url = "https://example.com/pricing";

  let { res, data } = await check(url);
  assert.equal(res.status, 200);
  assert.equal(data.status, "baseline");
  assert.equal(data.credits, 1);
  assert.equal("engine" in data, false, "the engine is internal and is not returned");
  // The CLI's call, minus mode:"auto": the demo sends one plain fetch that may cost 1 credit, never an escalation.
  assert.deepEqual(calls.scrape[0], {
    url,
    response_format: "markdown",
    main_content_only: true,
    max_cost: 1,
    cache: false,
  });
  assert.equal(calls.scrape[0].mode, undefined);
  const stored = kv.get(sha(url));
  assert.ok(stored, "snapshot is keyed by sha256(url)");
  assert.equal(stored.opts.expirationTtl, 7 * 24 * 3600);
  assert.equal(JSON.parse(stored.value).content, V1.trim());

  ({ data } = await check(url));
  assert.equal(data.status, "unchanged");
  assert.ok(data.previousCheckedAt);

  api.scrape.body = V2;
  ({ data } = await check(url));
  assert.equal(data.status, "changed");
  assert.deepEqual(data.diff, { added: 2, removed: 1, text: "- Pro plan: $20\n+ Pro plan: $25\n+ New: Team plan" });
  assert.equal(JSON.parse(kv.get(sha(url)).value).content, V2.trim(), "the new page becomes the next baseline");

  assert.deepEqual(events.map((e) => e.blobs[1]), ["baseline", "unchanged", "changed"]);
});

test("a bare host gets https:// and the same snapshot key as the full URL", async () => {
  await check("example.com");
  assert.equal(calls.scrape[0].url, "https://example.com/");
  assert.ok(kv.has(sha("https://example.com/")));
});

test("target status >= 400 is blocked and writes no snapshot", async () => {
  const url = "https://example.com/";
  await check(url);
  const before = kv.get(sha(url)).value;
  api.scrape = { body: "Access denied", targetStatus: 403, engine: "obscura", credits: 3 };
  const { res, data } = await check(url);
  assert.equal(res.status, 200);
  assert.equal(data.status, "blocked");
  assert.equal(data.targetStatus, 403);
  assert.equal(data.credits, 3);
  assert.doesNotMatch(JSON.stringify(data), ENGINE_NAMES, "no engine name in the answer");
  assert.match(data.commands, /node monitor\.mjs/, "a blocked site is pointed at the CLI");
  assert.match(data.message, /CLI escalates/);
  assert.equal(kv.get(sha(url)).value, before);

  kv.clear();
  api.scrape.targetStatus = 503;
  await check("https://example.net/");
  assert.equal(kv.size, 0, "no snapshot for a blocked first check either");
});

test("only a target status of exactly 200 is stored: 202/203/204/206/3xx/4xx/5xx are blocked", async () => {
  const url = "https://example.com/partial";
  await check(url);
  const before = kv.get(sha(url)).value;
  const puts = kvPuts;
  for (const targetStatus of [201, 202, 203, 204, 206, 301, 304, 404, 500]) {
    api.scrape = { body: "# A different, partial page\n", targetStatus, engine: "fetch", credits: 0 };
    const { res, data } = await check(url);
    assert.equal(res.status, 200, String(targetStatus));
    assert.equal(data.status, "blocked", String(targetStatus));
    assert.equal(data.targetStatus, targetStatus);
  }
  assert.equal(kvPuts, puts, "nothing was written");
  assert.equal(kv.get(sha(url)).value, before);

  // A response with no X-Target-Status header at all is not a 200 either.
  kv.clear();
  api.scrape = { body: "# page", targetStatus: "", engine: "fetch", credits: 1 };
  assert.equal((await check("https://example.net/")).data.status, "blocked");
  assert.equal(kv.size, 0);
});

test("KV: an unchanged page is not rewritten, a changed one is", async () => {
  const url = "https://example.com/kv";
  await check(url);
  assert.equal(kvPuts, 1, "baseline writes once");
  await check(url);
  await check(url);
  assert.equal(kvPuts, 1, "unchanged checks write nothing");
  api.scrape.body = V2;
  await check(url);
  assert.equal(kvPuts, 2, "a change writes the new baseline");
  assert.equal(JSON.parse(kv.get(sha(url)).value).content, V2.trim());
});

test("KV: a failed write still returns the computed result, and the error is not leaked", async () => {
  const url = "https://example.com/kvfail";
  await check(url); // baseline stored
  kvPutFails = true;
  api.scrape.body = V2;
  let { res, data } = await check(url);
  assert.equal(res.status, 200);
  assert.equal(data.status, "changed");
  assert.equal(data.diff.added, 2);

  kv.clear();
  ({ res, data } = await check("https://example.org/kvfail"));
  assert.equal(res.status, 200);
  assert.equal(data.status, "baseline");
  assert.ok(seen.every((t) => !t.includes("Too Many Requests")));
  assert.ok(logged.some((l) => l.includes("snapshot write failed")));
});

test("analytics: one data point per call with outcome, host, country, credits, duration", async () => {
  const req = new Request("https://change-monitor.spicrawl.com/api/check", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": "35" },
    body: JSON.stringify({ url: "https://Example.com/a?b=1" }),
  });
  Object.defineProperty(req, "cf", { value: { country: "IN" } });
  const c = ctx();
  await (await worker.fetch(req, makeEnv(), c)).text();
  assert.equal(events.length, 1);
  const [e] = events;
  assert.deepEqual(e.blobs, ["change-monitor", "baseline", "example.com", "IN"]);
  assert.deepEqual(e.indexes, ["change-monitor"]);
  assert.equal(e.doubles[0], 1);
  assert.ok(e.doubles[1] >= 0);
});

test("works without the Analytics Engine and rate limiter bindings", async () => {
  const { data } = await check("https://example.com/", { env: makeEnv({ EVENTS: undefined, LIMITER: undefined }) });
  assert.equal(data.status, "baseline");
});

const REJECTED = [
  "ftp://example.com/file",
  "file:///etc/passwd",
  "javascript:alert(1)",
  "http://localhost/",
  "http://localhost:8787/admin",
  "http://LOCALHOST./",
  "http://localhost../",
  "http://LOCALHOST.../",
  "http://metadata.google.internal./",
  "http://metadata.google.internal../",
  "http://127.0.0.1../",
  "http://intranet../",
  "http://router.home.arpa/",
  "http://router.home.arpa../",
  "http://home.arpa/",
  "http://127.0.0.1/",
  "http://127.1/",
  "http://2130706433/",
  "http://0x7f.0.0.1/",
  "http://10.0.0.5/",
  "http://192.168.1.1/",
  "http://172.16.0.1/",
  "http://172.31.255.255/",
  "http://8.8.8.8/",
  "http://[::1]/",
  "http://[2001:db8::1]/",
  "http://printer.local/",
  "https://db.internal/",
  "http://intranet/",
  "https://user:pass@example.com/",
  `https://example.com/${"a".repeat(2048)}`,
  "",
  "   ",
  "http://",
];

test("invalid and private URLs are rejected before any scrape or credit lookup", async () => {
  for (const url of REJECTED) {
    const { res, data } = await check(url);
    assert.equal(res.status, 400, url.slice(0, 60));
    assert.equal(data.status, "invalid", url.slice(0, 60));
    assert.ok(data.message.length > 10);
  }
  assert.equal(calls.scrape.length, 0);
  assert.equal(calls.summary, 0);
  assert.equal(kv.size, 0);
  assert.equal(events.length, REJECTED.length);
  assert.ok(events.every((e) => e.blobs[1] === "invalid"));
});

test("bad bodies are invalid: not JSON, wrong content type, url not a string", async () => {
  assert.equal((await post(null, { raw: "{nope" })).data.status, "invalid");
  assert.equal((await post(null, { raw: "url=https://example.com", headers: { "content-type": "text/plain" } })).data.status, "invalid");
  assert.equal((await post({ url: 42 })).data.status, "invalid");
  assert.equal(calls.scrape.length, 0);
});

test("the request body needs a numeric Content-Length of at most 4096", async () => {
  // Chunked: no Content-Length header at all. Used to pass because Number(null) is 0.
  let { res, data } = await check("https://example.com/", { headers: { "content-length": null } });
  assert.equal(res.status, 411);
  assert.equal(data.status, "invalid");
  for (const bad of ["", "abc", "-1", "12.5", "1e3", "0x10", "4096, 4096"]) {
    ({ res } = await check("https://example.com/", { headers: { "content-length": bad } }));
    assert.equal(res.status, 411, JSON.stringify(bad));
  }
  for (const big of ["4097", "100000", "99999999999999999999"]) {
    ({ res, data } = await check("https://example.com/", { headers: { "content-length": big } }));
    assert.equal(res.status, 413, big);
    assert.equal(data.status, "invalid");
  }
  assert.equal(calls.scrape.length, 0);
  assert.equal(calls.summary, 0);
  ({ res } = await check("https://example.com/", { headers: { "content-length": "4096" } }));
  assert.equal(res.status, 200, "4096 is the largest accepted size");
});

test("parseTarget drops every trailing dot before the host checks", () => {
  for (const url of ["http://localhost../", "http://metadata.google.internal../", "http://x.home.arpa../", "http://home.arpa/"]) {
    assert.ok(parseTarget(url).error, url);
  }
  assert.equal(parseTarget("http://localhost../").host, "localhost");
  assert.equal(parseTarget("https://example.com./").host, "example.com");
});

test("parseTarget accepts public URLs and drops the fragment", () => {
  assert.equal(parseTarget("https://example.com/a#top").url, "https://example.com/a");
  assert.equal(parseTarget("http://sub.example.co.uk:8080/x?y=1").url, "http://sub.example.co.uk:8080/x?y=1");
  assert.equal(parseTarget("https://xn--bcher-kva.example/").url, "https://xn--bcher-kva.example/");
});

test("rate limit: 429 with a message, keyed by CF-Connecting-IP, no scrape", async () => {
  allowed = false;
  const { res, data } = await check("https://example.com/");
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("retry-after"), "60");
  assert.equal(data.status, "rate_limited");
  assert.match(data.message, /Too many checks/);
  assert.equal(limiterKey, "203.0.113.9");
  assert.equal(calls.scrape.length, 0);
  assert.equal(events[0].blobs[1], "rate_limited");
});

test("rate limit: an IPv6 visitor is keyed on its /64, however the address is written", async () => {
  const same = [
    "2001:db8:1:2:3:4:5:6",
    "2001:DB8:1:2:ffff:ffff:ffff:ffff",
    "2001:db8:1:2::9",
    "2001:db8:1:2:0:0:0:1",
    "2001:0db8:0001:0002::",
  ];
  for (const ip of same) assert.equal(ipKey(ip), "2001:db8:1:2", ip);
  // `::` inside the first four groups must not leak interface-id bits into the key.
  for (const ip of ["2001:db8::1", "2001:db8::5:6:7:8", "2001:db8:0:0:aaaa:bbbb:cccc:dddd", "2001:db8::"]) {
    assert.equal(ipKey(ip), "2001:db8:0:0", ip);
  }
  assert.equal(ipKey("::1"), "0:0:0:0");
  assert.notEqual(ipKey("2001:db8:1:3::1"), ipKey("2001:db8:1:2::1"), "a neighbouring /64 is a different visitor");
  // IPv4, a missing header and IPv4-mapped addresses are keyed as they are.
  for (const ip of ["203.0.113.9", "unknown", "::ffff:203.0.113.9"]) assert.equal(ipKey(ip), ip);
  assert.doesNotThrow(() => ipKey("1:2:3:4:5:6:7:8:9::"), "a malformed address must not crash the limiter");

  await check("https://example.com/", { headers: { "cf-connecting-ip": "2001:db8:1:2:aaaa:bbbb:cccc:dddd" } });
  assert.equal(limiterKey, "2001:db8:1:2");
  await check("https://example.com/", { headers: { "cf-connecting-ip": "2001:db8:1:2::77" } });
  assert.equal(limiterKey, "2001:db8:1:2");
  await check("https://example.com/", { headers: { "cf-connecting-ip": null } });
  assert.equal(limiterKey, "unknown");
});

test("credit guard: under 100 credits refuses with the clone commands", async () => {
  api.elapsed = 1; // late in the month, so only the floor can refuse
  api.remainingMicro = 99e6;
  const { res, data } = await check("https://example.com/");
  assert.equal(res.status, 503);
  assert.equal(data.status, "no_credits");
  assert.match(data.message, /used its credits for this month/);
  assert.match(data.message, /Run it yourself with a free key/);
  assert.match(data.commands, /git clone https:\/\/github\.com\/OfficialSpicrawl\/change-monitor\.git/);
  assert.match(data.commands, /npm install/);
  assert.match(data.commands, /node monitor\.mjs/);
  assert.equal(calls.scrape.length, 0);
  assert.equal(events[0].blobs[1], "no_credits");
});

test("credit guard: exactly 100 credits, or an unlimited allowance, is allowed", async () => {
  api.elapsed = 1;
  api.remainingMicro = 100e6;
  assert.equal((await check("https://example.com/")).data.status, "baseline");
  cacheStore.clear();
  api.unlimited = true;
  api.remainingMicro = 0;
  assert.equal((await check("https://example.org/")).data.status, "baseline");
});

test("credit guard: the usage summary is cached for 60 seconds under a synthetic key", async () => {
  await check("https://example.com/");
  await check("https://example.com/");
  await check("https://example.org/");
  assert.equal(calls.summary, 1);
  assert.equal(calls.scrape.length, 3);
  assert.deepEqual([...cacheStore.keys()], ["https://cache.internal/usage-summary"], "never the real API URL");
  const cached = cacheStore.get("https://cache.internal/usage-summary");
  assert.match(cached.headers.get("cache-control"), /max-age=60/);
  const { allowance } = await cached.clone().json();
  assert.deepEqual(Object.keys(allowance).sort(), ["end", "left", "limit", "start"], "only the numbers the guards need");
  assert.equal(allowance.left, 900e6);
});

test("pace guard: refuses once spending is more than 5% of the limit ahead of an even pace", async () => {
  api.elapsed = 0.5; // allowed up to 55% of 1000 = 550 credits used
  api.remainingMicro = 460e6; // 540 used
  assert.equal((await check("https://example.com/ok")).data.status, "baseline");

  cacheStore.clear();
  api.remainingMicro = 440e6; // 560 used
  const { res, data } = await check("https://example.com/ahead");
  assert.equal(res.status, 503);
  assert.equal(data.status, "paced");
  assert.match(data.message, /Today's share of the demo's credits is used up/);
  assert.match(data.message, /try again tomorrow/i);
  assert.match(data.message, /run it yourself/);
  assert.match(data.commands, /node monitor\.mjs/);
  assert.equal(calls.scrape.length, 1, "no scrape for the refused one");
  assert.equal(events.at(-1).blobs[1], "paced");

  // Early in the month the same spend is far ahead of pace; the first few percent are fine.
  cacheStore.clear();
  api.elapsed = 0.02;
  api.remainingMicro = 920e6; // 80 used > 1000 * (0.02 + 0.05) = 70
  assert.equal((await check("https://example.com/early")).data.status, "paced");
  cacheStore.clear();
  api.remainingMicro = 940e6; // 60 used <= 70
  assert.equal((await check("https://example.com/early2")).data.status, "baseline");
});

test("credit guard and pace guard fail closed on a summary they cannot read", async () => {
  const bad = [
    { remaining_micro: "lots" },
    { remaining_micro: null },
    { remaining_micro: undefined },
    { limit_micro: "x" },
    { window_start: "yesterday" },
    { resets_at: "someday" },
    { window_start: undefined, resets_at: undefined },
    { resets_at: new Date(Date.now() - 40 * DAY).toISOString() }, // a window that ends before it starts
  ];
  for (const patch of bad) {
    cacheStore.clear();
    api.summaryPatch = patch;
    const { res, data } = await check("https://example.com/closed");
    assert.equal(res.status, 503, JSON.stringify(patch));
    assert.match(data.status, /^(no_credits|paced)$/, JSON.stringify(patch));
  }
  cacheStore.clear();
  api.allowance = null; // no allowance object at all
  assert.equal((await check("https://example.com/closed")).res.status, 503);
  assert.equal(calls.scrape.length, 0, "not one scrape was paid for");
});

test("creditGate: the arithmetic, the clamps and the NaN cases", () => {
  const month = 30 * DAY;
  const a = (usedCredits) => ({ limit: 1000e6, left: (1000 - usedCredits) * 1e6, start: 0, end: month });
  assert.equal(creditGate(null), null, "unlimited");
  assert.equal(creditGate(a(0), 0), null);
  assert.equal(creditGate(a(50), 0), null, "5% of the limit is always allowed");
  assert.equal(creditGate(a(51), 0).body.status, "paced");
  assert.equal(creditGate(a(550), month / 2), null);
  assert.equal(creditGate(a(551), month / 2).body.status, "paced");
  assert.equal(creditGate(a(900), month * 3), null, "after the window ends the pace is the whole limit, not more");
  assert.equal(creditGate(a(60), -DAY).body.status, "paced", "a clock before the window start does not widen the allowance");
  assert.equal(creditGate(a(901), month).body.status, "no_credits", "the 100 credit floor comes first");
  for (const broken of [undefined, {}, { limit: NaN, left: NaN, start: NaN, end: NaN }, { ...a(0), end: 0 }, { ...a(0), start: NaN }]) {
    assert.ok(creditGate(broken, 1), JSON.stringify(broken));
  }
});

test("SDK errors become friendly fixed messages with the error code, and nothing raw", async () => {
  const detail = `db-7.corp.example refused ${KEY}`;
  const cases = [
    [401, { code: "ERR::AUTH::INVALID_KEY", detail }, 502, "error", /API key was rejected/],
    [403, { code: "ERR::AUTH::ENGINE_NOT_ENTITLED", detail }, 502, "error", /API key was rejected/],
    [402, { code: "ERR::LIMIT::QUOTA_EXCEEDED", detail }, 503, "no_credits", /used its credits/],
    [429, { code: "ERR::LIMIT::RATE_LIMITED", detail }, 503, "error", /rate limiting/],
    [400, { code: "ERR::SECURITY::SSRF_BLOCKED", detail }, 400, "invalid", /could not accept that URL.*\(ERR::SECURITY::SSRF_BLOCKED\)/],
    [400, { code: "ERR::REQUEST::INVALID_URL", detail }, 400, "invalid", /could not accept that URL.*\(ERR::REQUEST::INVALID_URL\)/],
    [502, { code: "ERR::INTERNAL::ERROR", detail }, 502, "error", /could not complete the check.*\(ERR::INTERNAL::ERROR\)/],
    [502, { code: "<script>alert(1)</script>", detail }, 502, "error", /^Spicrawl could not complete the check\. Try again in a moment\.$/],
    [500, { detail }, 502, "error", /^Spicrawl could not complete the check\. Try again in a moment\.$/],
  ];
  for (const [status, problem, http, outcome, message] of cases) {
    api.scrapeError = [status, problem];
    const { res, data } = await check(`https://example.com/${status}${problem.code ?? ""}`);
    assert.equal(res.status, http, `${status} ${problem.code}`);
    assert.equal(data.status, outcome, `${status} ${problem.code}`);
    assert.match(data.message, message, `${status} ${problem.code}`);
  }
  assert.equal(kv.size, 0);
  assert.ok(events.every((e) => e.doubles[0] === 0));
  assert.ok(seen.length > 0 && seen.every((t) => !t.includes(KEY) && !t.includes("db-7.corp") && !t.includes("<script>")));
  assert.ok(logged.length > 0 && logged.every((l) => !l.includes(KEY)), "logs are scrubbed too");
});

test("a site that costs more than 1 credit, or refuses a plain fetch, gets the blocked message pointing at the CLI", async () => {
  for (const [status, code] of [
    [400, "ERR::LIMIT::MAX_COST_EXCEEDED"],
    [502, "ERR::UPSTREAM::CHALLENGE"],
    [503, "ERR::PROXY::EXHAUSTED"],
    [503, "ERR::ENGINE::UNAVAILABLE"],
  ]) {
    api.scrapeError = [status, { code, detail: `internal detail ${KEY}` }];
    const { res, data } = await check(`https://example.com/${code}`);
    assert.equal(res.status, 200, code);
    assert.equal(data.status, "blocked", code);
    assert.match(data.message, /one basic request/, code);
    assert.ok(data.message.includes(`(${code})`), code);
    assert.match(data.message, /CLI escalates/, code);
    assert.match(data.commands, /node monitor\.mjs/, code);
    assert.ok(!JSON.stringify(data).includes("internal detail"), code);
  }
  assert.equal(kv.size, 0);
});

test("a missing API key is a friendly error, and a KV failure is a generic one", async () => {
  let r = await check("https://example.com/", { env: makeEnv({ SPICRAWL_API_KEY: "" }) });
  assert.equal(r.res.status, 502);
  assert.match(r.data.message, /not yours/);

  const env = makeEnv();
  env.SNAPSHOTS.get = async () => {
    throw new Error("KV down");
  };
  r = await check("https://example.com/", { env });
  assert.equal(r.res.status, 500);
  assert.equal(r.data.status, "error");
  assert.equal(calls.scrape.length, 0, "KV is read before the scrape, so an outage costs no credits");
});
