#!/usr/bin/env node
// Fails (exit 1) when the Spicrawl key in SPICRAWL_API_KEY has fewer than MIN_CREDITS
// credits left this month (default 100). Used by CI before the live demo runs.
// No dependencies: one GET /v1/usage/summary.
import fs from "node:fs";

const key = process.env.SPICRAWL_API_KEY;
const min = Number(process.env.MIN_CREDITS ?? 100);
const base = process.env.SPICRAWL_BASE_URL ?? "https://api.spicrawl.com";

if (!key) {
  console.error("SPICRAWL_API_KEY is not set (add it as a repository secret).");
  process.exit(1);
}

const res = await fetch(`${base}/v1/usage/summary`, { headers: { Authorization: `Bearer ${key}` } });
if (!res.ok) {
  console.error(`Usage summary failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
const { allowance } = await res.json();
const remaining = allowance.unlimited ? Infinity : Math.floor(allowance.remaining_micro / 1e6);
const ok = remaining >= min;
const line = allowance.unlimited
  ? "Credits: unlimited"
  : `Credits left: ${remaining} of ${allowance.limit_credits} (resets ${allowance.resets_at}); threshold ${min}`;

console.log(`${ok ? "OK" : "LOW"} ${line}`);
// Surface the numbers in the GitHub Actions run summary and as step outputs.
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${ok ? "✅" : "❌"} ${line}\n`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `remaining=${remaining}\nok=${ok}\n`);
process.exit(ok ? 0 : 1);
