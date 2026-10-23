// Runs the monitor against a stubbed fetch passed into the Spicrawl client, so it needs no
// network and no API key. Run with `npm test`.
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Spicrawl } from "@spicrawl/sdk";
import { diffLines, formatResult, parseInterval, runOnce, sendWebhooks } from "./monitor.mjs";

const PAGE_URL = "https://example.com/pricing";
const V1 = "# Pricing\n\nFree plan: $0\nPro plan: $20\n";
const V2 = "# Pricing\n\nFree plan: $0\nPro plan: $25\nNew: Team plan\n";

// What the stubbed API returns next. A scrapeRaw() response is the page itself, with the
// metadata in headers: X-Target-Status is the target site's status, X-Credits-Charged the cost.
let page = { body: V1, targetStatus: 200 };
const requests = [];
const stubFetch = async (_endpoint, init) => {
  requests.push(JSON.parse(init.body));
  return new Response(page.body, {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "x-target-status": String(page.targetStatus),
      "x-credits-charged": "1",
      "x-engine": "fetch",
    },
  });
};

test("monitor lifecycle: baseline, unchanged, changed, blocked", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "change-monitor-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const statePath = join(dir, "state.json");
  const spicrawl = new Spicrawl({ apiKey: "spicrawl_test_stub", fetch: stubFetch });
  const run = () => runOnce({ spicrawl, urls: [PAGE_URL], statePath });
  const saved = () => JSON.parse(readFileSync(statePath, "utf8"))[PAGE_URL];

  await t.test("first run saves a baseline, not a change", async () => {
    const { results, credits } = await run();
    assert.equal(results[0].status, "baseline");
    assert.equal(credits, 1);
    assert.deepEqual(requests[0], {
      url: PAGE_URL,
      response_format: "markdown",
      main_content_only: true,
      mode: "auto",
      cache: false,
    });
    assert.match(saved().hash, /^[0-9a-f]{64}$/);
    assert.equal(saved().content, V1.trim());
    assert.ok(saved().checkedAt);
  });

  await t.test("second run with the same content is unchanged", async () => {
    const { results } = await run();
    assert.equal(results[0].status, "unchanged");
  });

  await t.test("changed content is reported with a line diff", async () => {
    page = { body: V2, targetStatus: 200 };
    const { results } = await run();
    assert.equal(results[0].status, "changed");
    assert.deepEqual(results[0].diff, {
      added: 2,
      removed: 1,
      text: "- Pro plan: $20\n+ Pro plan: $25\n+ New: Team plan",
    });
    assert.match(formatResult(results[0]), /^Changed: https:\/\/example.com\/pricing \(\+2 -1 lines\)\n- Pro plan: \$20\n/);
    assert.equal(saved().content, V2.trim()); // the new page is the next baseline
  });

  await t.test("a target 403 is reported as blocked and leaves the state untouched", async () => {
    const before = readFileSync(statePath, "utf8");
    page = { body: "Access denied", targetStatus: 403 };
    const { results } = await run();
    assert.equal(results[0].status, "blocked");
    assert.equal(results[0].targetStatus, 403);
    assert.match(formatResult(results[0]), /Blocked\/unavailable: .* HTTP 403/);
    assert.equal(readFileSync(statePath, "utf8"), before);
  });

  await t.test("after the block clears, the page is unchanged, not 'changed back'", async () => {
    page = { body: V2, targetStatus: 200 };
    const { results } = await run();
    assert.equal(results[0].status, "unchanged");
  });
});

test("diff is truncated to 20 lines", () => {
  const after = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
  const { added, removed, text } = diffLines("gone", after);
  assert.deepEqual([added, removed], [50, 1]);
  assert.equal(text.split("\n").length, 21); // 20 lines plus "... N more lines"
  assert.match(text, /\.\.\. 31 more lines$/);
});

test("--every accepts s, m and h", () => {
  assert.equal(parseInterval("30s"), 30_000);
  assert.equal(parseInterval("15m"), 900_000);
  assert.equal(parseInterval("2h"), 7_200_000);
  assert.throws(() => parseInterval("15"), /Bad --every/);
  assert.throws(() => parseInterval("0m"), /Bad --every/);
});

test("alerts POST {content} to Discord and {text} to Slack", async () => {
  const got = {};
  const server = createServer((req, res) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      got[req.url] = JSON.parse(data);
      res.end("ok");
    });
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    await sendWebhooks("hello", { DISCORD_WEBHOOK_URL: `${base}/discord`, SLACK_WEBHOOK_URL: `${base}/slack` });
    assert.deepEqual(got, { "/discord": { content: "hello" }, "/slack": { text: "hello" } });
  } finally {
    server.close();
    server.closeAllConnections();
  }
});
