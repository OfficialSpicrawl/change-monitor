// Calls the Worker's fetch handler directly with a stubbed env (KV, rate limiter, Analytics
// Engine), a stubbed Cache API and a stubbed fetch for the Spicrawl API. No network, no key.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { beforeEach, test } from "node:test";
import worker, { parseTarget } from "../src/worker.mjs";

const KEY = "spicrawl_test_SECRET_do_not_leak";
const V1 = "# Pricing\n\nFree plan: $0\nPro plan: $20\n";
const V2 = "# Pricing\n\nFree plan: $0\nPro plan: $25\nNew: Team plan\n";
const sha = (s) => createHash("sha256").update(s).digest("hex");

let api; // what the stubbed Spicrawl API does next
let calls; // requests the stub saw
let kv, events, allowed, limiterKey;
let seen; // every response body, to prove the key never leaks
const logged = []; // console.error lines
console.error = (...args) => logged.push(args.join(" "));

const reset = () => {
  api = {
    remainingMicro: 900e6,
    unlimited: false,
    scrape: { body: V1, targetStatus: 200, engine: "fetch", credits: 1 },
    scrapeError: null, // [httpStatus, problem body]
  };
  calls = { summary: 0, scrape: [] };
  kv = new Map();
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

globalThis.fetch = async (url, init) => {
  assert.equal(init.headers.Authorization, `Bearer ${KEY}`);
  if (String(url) === "https://api.spicrawl.com/v1/usage/summary") {
    calls.summary++;
    const allowance = { unlimited: api.unlimited, remaining_micro: api.remainingMicro, limit_credits: 1000 };
    return new Response(JSON.stringify({ allowance }), { headers: { "content-type": "application/json" } });
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
    put: async (k, value, opts) => void kv.set(k, { value, opts }),
  },
  LIMITER: { limit: async ({ key }) => ((limiterKey = key), { success: allowed }) },
  EVENTS: { writeDataPoint: (p) => events.push(p) },
  ...extra,
});
const ctx = () => {
  const pending = [];
  return { waitUntil: (p) => pending.push(p), settle: () => Promise.all(pending) };
};

async function post(body, { env = makeEnv(), headers = {}, raw } = {}) {
  const c = ctx();
  const req = new Request("https://change-monitor.spicrawl.com/api/check", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.9", ...headers },
    body: raw ?? JSON.stringify(body),
  });
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
  assert.match(off.html, /Run it yourself/);
  assert.match(off.html, /git clone https:\/\/github\.com\/OfficialSpicrawl\/change-monitor\.git/);
  assert.match(off.html, /node monitor\.mjs/);
  assert.match(off.html, /href="https:\/\/app\.spicrawl\.com"/);
  assert.doesNotMatch(off.html, /cloudflareinsights|<!--BEACON-->/);

  const on = await get(makeEnv({ BEACON_TOKEN: "abc123" }));
  assert.ok(on.html.includes(`<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "abc123"}'></script>`));
  const evil = await get(makeEnv({ BEACON_TOKEN: `x'><script>alert(1)</script>` }));
  assert.doesNotMatch(evil.html, /alert\(1\)/);
});

test("routing: unknown path 404, wrong method 405", async () => {
  const run = (path, method) => worker.fetch(new Request(`https://x.test${path}`, { method }), makeEnv(), ctx());
  assert.equal((await run("/nope", "GET")).status, 404);
  assert.equal((await run("/api/check", "GET")).status, 405);
  assert.equal((await run("/", "POST")).status, 405);
});

test("lifecycle: baseline, unchanged, changed with diff", async () => {
  const url = "https://example.com/pricing";

  let { res, data } = await check(url);
  assert.equal(res.status, 200);
  assert.equal(data.status, "baseline");
  assert.equal(data.credits, 1);
  assert.equal(data.engine, "fetch");
  // The same call as the CLI makes.
  assert.deepEqual(calls.scrape[0], {
    url,
    response_format: "markdown",
    main_content_only: true,
    mode: "auto",
    cache: false,
  });
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
  assert.equal(data.engine, "obscura");
  assert.equal(kv.get(sha(url)).value, before);

  kv.clear();
  api.scrape.targetStatus = 503;
  await check("https://example.net/");
  assert.equal(kv.size, 0, "no snapshot for a blocked first check either");
});

test("analytics: one data point per call with outcome, host, country, credits, duration", async () => {
  const req = new Request("https://change-monitor.spicrawl.com/api/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
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

test("credit guard: under 100 credits refuses with the clone commands", async () => {
  api.remainingMicro = 99e6;
  const { res, data } = await check("https://example.com/");
  assert.equal(res.status, 503);
  assert.equal(data.status, "no_credits");
  assert.match(data.message, /used its credits for this month/);
  assert.match(data.message, /run it yourself with a free key/);
  assert.match(data.commands, /git clone https:\/\/github\.com\/OfficialSpicrawl\/change-monitor\.git/);
  assert.match(data.commands, /npm install/);
  assert.match(data.commands, /node monitor\.mjs/);
  assert.equal(calls.scrape.length, 0);
  assert.equal(events[0].blobs[1], "no_credits");
});

test("credit guard: exactly 100 credits, or an unlimited allowance, is allowed", async () => {
  api.remainingMicro = 100e6;
  assert.equal((await check("https://example.com/")).data.status, "baseline");
  cacheStore.clear();
  api.unlimited = true;
  api.remainingMicro = 0;
  assert.equal((await check("https://example.org/")).data.status, "baseline");
});

test("credit guard: the usage summary is cached for 60 seconds", async () => {
  await check("https://example.com/");
  await check("https://example.com/");
  await check("https://example.org/");
  assert.equal(calls.summary, 1);
  assert.equal(calls.scrape.length, 3);
  const cached = cacheStore.get("https://api.spicrawl.com/v1/usage/summary");
  assert.match(cached.headers.get("cache-control"), /max-age=60/);
  assert.deepEqual(await cached.clone().json(), { remaining: 900 }, "only the derived number is cached");
});

test("SDK errors become friendly messages and the key never appears", async () => {
  const cases = [
    [401, { code: "ERR::AUTH::INVALID_KEY", detail: `bad key ${KEY}` }, 502, "error", /API key was rejected/],
    [402, { code: "ERR::LIMIT::QUOTA_EXCEEDED", detail: "out" }, 503, "no_credits", /used its credits/],
    [429, { code: "ERR::LIMIT::RATE_LIMITED", detail: "slow" }, 503, "error", /rate limiting/],
    [400, { code: "ERR::REQUEST::INVALID_URL", detail: `url refused ${KEY}` }, 400, "invalid", /url refused \[redacted\]/],
    [502, { code: "ERR::TARGET::UNREACHABLE", detail: "target did not answer" }, 502, "error", /target did not answer/],
  ];
  for (const [status, problem, http, outcome, message] of cases) {
    api.scrapeError = [status, problem];
    const { res, data } = await check(`https://example.com/${status}`);
    assert.equal(res.status, http, String(status));
    assert.equal(data.status, outcome, String(status));
    assert.match(data.message, message, String(status));
  }
  assert.equal(kv.size, 0);
  assert.ok(events.every((e) => e.doubles[0] === 0));
  assert.ok(seen.length > 0 && seen.every((t) => !t.includes(KEY)));
  assert.ok(logged.length > 0 && logged.every((l) => !l.includes(KEY)), "logs are scrubbed too");
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
