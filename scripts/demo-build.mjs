// Builds what the demo page needs next to the Worker, into demo/public (served as static assets, see "assets" in
// demo/wrangler.jsonc): the bundled client code (demo/client), the Geist and Righteous fonts, the wordmark, the favicon, the social
// preview image and the third-party licences. All of it is git-ignored except robots.txt and sitemap.xml, which are committed.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const root = new URL("../", import.meta.url);
const path = (p) => new URL(p, root).pathname;
const pub = (p) => path(`demo/public/${p}`);
mkdirSync(pub("fonts"), { recursive: true });
// No stale chunks. Remove the files, not the folder: a running `wrangler dev` watches the folder itself.
for (const f of readdirSync(pub(""))) if (/^(app|chunk-.*)\.js$/.test(f)) rmSync(pub(f));

await build({
  entryPoints: [path("demo/client/main.jsx")],
  outdir: pub(""),
  entryNames: "app",
  chunkNames: "chunk-[hash]",
  bundle: true,
  splitting: true, // the avatar library is its own chunk, loaded on demand
  minify: true,
  format: "esm",
  target: "es2020",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "none", // the licences ship in /THIRD-PARTY.txt
  banner: { js: "/* Third-party licences (React, bot-avatars, thinking-orbs, ascii.rest): /THIRD-PARTY.txt */" },
  logLevel: "warning",
});

// Fonts: Geist and Geist Mono (SIL OFL 1.1), self-hosted so the page makes no third-party request.
const fonts = path("node_modules/geist/dist/fonts/");
copyFileSync(`${fonts}geist-sans/Geist-Variable.woff2`, pub("fonts/Geist-Variable.woff2"));
copyFileSync(`${fonts}geist-mono/GeistMono-Variable.woff2`, pub("fonts/GeistMono-Variable.woff2"));
// Righteous (SIL OFL 1.1), the home page's H1 only: the Latin subset, weight 400, from the @fontsource package.
copyFileSync(path("node_modules/@fontsource/righteous/files/righteous-latin-400-normal.woff2"), pub("fonts/Righteous-Latin.woff2"));
copyFileSync(path("videos/public/brand/wordmark.svg"), pub("spicrawl.svg"));
// The favicon: the spider mark, white on the page's ground colour, so it shows on a light or a dark tab bar.
const mark = readFileSync(path("videos/public/brand/mark.svg"), "utf8");
const markBody = mark.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
writeFileSync(pub("favicon.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#16181B"/><svg x="3" y="6.8" width="26" height="18.4" viewBox="0 0 472 333" fill="none">${markBody}</svg></svg>\n`);
copyFileSync(path("launch/social-preview.png"), pub("og.png"));

// The licences of what ships to the browser, in one file.
const LICENSED = ["react", "react-dom", "scheduler", "bot-avatars", "thinking-orbs", "ascii.rest", "geist", "@fontsource/righteous"];
const licences = LICENSED.map((name) => {
  const dir = path(`node_modules/${name}/`);
  const file = readdirSync(dir).find((f) => /^licen[sc]e(\.txt|\.md)?$/i.test(f));
  const { version } = JSON.parse(readFileSync(`${dir}package.json`, "utf8"));
  return `${name} ${version}\n${"-".repeat(name.length + version.length + 1)}\n${file ? readFileSync(`${dir}${file}`, "utf8").trim() : "(no licence file in the package)"}`;
});
writeFileSync(pub("THIRD-PARTY.txt"), `Third-party code and fonts served by this page.\n\n${licences.join("\n\n\n")}\n`);

for (const f of readdirSync(pub("")).filter((f) => f.endsWith(".js"))) {
  const js = readFileSync(pub(f));
  console.log(`demo/public/${f} ${(js.length / 1024).toFixed(0)} KB (${(gzipSync(js).length / 1024).toFixed(0)} KB gzipped)`);
}
