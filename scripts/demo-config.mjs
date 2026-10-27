// Builds demo/wrangler.local.jsonc (gitignored) from demo/wrangler.jsonc, filling in the KV namespace id
// from SNAPSHOTS_KV_ID, so the real id never lands in this public repo.
// Create the namespace once with `npx wrangler kv namespace create SNAPSHOTS` and keep its id in your environment.
import { readFileSync, writeFileSync } from "node:fs";

const id = String(process.env.SNAPSHOTS_KV_ID || "").trim();
if (!/^[0-9a-f]{32}$/.test(id)) {
  console.error("Set SNAPSHOTS_KV_ID to your KV namespace id (32 hex characters) before deploying.");
  process.exit(1);
}
const src = readFileSync(new URL("../demo/wrangler.jsonc", import.meta.url), "utf8");
if (!src.includes("REPLACE_WITH_KV_ID")) throw new Error("demo/wrangler.jsonc has no REPLACE_WITH_KV_ID placeholder.");
writeFileSync(new URL("../demo/wrangler.local.jsonc", import.meta.url), src.replace("REPLACE_WITH_KV_ID", id));
console.log("Wrote demo/wrangler.local.jsonc");
