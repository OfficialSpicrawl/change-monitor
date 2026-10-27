// The watch block: a scripted sample run, and a real check against /api/check typed at the same prompt.
// Plain DOM code. ascii.rest draws the pulse, the ghost in the URL field and the decoding diff line; the orb is React.
import { mountOrb } from "./islands.jsx";
import { decodeLine, mountGhost, mountPulse } from "./ascii.js";

const $ = (id) => document.getElementById(id);
const out = $("out"), form = $("form"), input = $("url"), go = $("go"), live = $("live");
const mode = $("mode"), replay = $("replay"), ghost = $("ghost"), field = $("field");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");

// A sample, not a recording: the CLI's real output format on an invented page.
const URL_ = "https://acme.dev/pricing";
const DIFF = [
  { cls: "del", text: "- Pro plan: $20 per month." },
  { cls: "del", text: "- Free trial: 14 days." },
  { cls: "add", text: "+ Pro plan: $25 per month." },
];
const LABEL = {
  baseline: "Baseline saved", unchanged: "Unchanged", changed: "Changed", blocked: "Blocked/unavailable",
  error: "Error", rate_limited: "Slow down", no_credits: "Demo out of credits", paced: "Busy today", invalid: "Check the URL",
};

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
/** A terminal line. Each part is a string, a node, or [text, className]. */
const ln = (cls, ...parts) => {
  const row = el("div", `ln ${cls}`.trim());
  for (const p of parts) row.append(typeof p === "string" || p instanceof Node ? p : el("span", p[1], p[0]));
  return row;
};

// --- the ASCII frame around a diff ---------------------------------------------------------------------------------

let charWidth = 0;
function columns() {
  if (!charWidth) {
    const probe = el("span", "probe", "0".repeat(40));
    out.append(probe);
    charWidth = probe.getBoundingClientRect().width / 40 || 8;
    probe.remove();
  }
  return Math.max(30, Math.min(84, Math.floor(out.clientWidth / charWidth)));
}

/** Breaks `text` to `width` characters, at spaces when it can, the continuation lines indented past the +/- sign. */
function wrap(text, width) {
  const lines = [];
  let rest = text;
  let pad = "";
  while (rest.length + pad.length > width) {
    let cut = rest.lastIndexOf(" ", width - pad.length);
    if (cut < 2) cut = width - pad.length;
    lines.push(pad + rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
    pad = "  ";
  }
  lines.push(pad + rest);
  return lines;
}

/** The rows of a box frame: top rule, one row per wrapped line, bottom rule. `adds` lists the cells of single-line + rows. */
function frame(title, rows, cols) {
  const inner = cols - 4;
  const rule = (l, r, label) => l + ((label ? `─ ${label} ` : "") + "─".repeat(cols)).slice(0, cols - 2) + r;
  const nodes = [ln("rule", rule("╭", "╮", title))];
  const adds = [];
  for (const r of rows) {
    const parts = wrap(r.text, inner);
    for (const part of parts) {
      const cell = el("span", `cell ${r.cls}`);
      if (r.cls === "del") cell.append(el("span", "t", part), " ".repeat(inner - part.length));
      else cell.textContent = part.padEnd(inner);
      nodes.push(ln("box", el("span", "edge", r.cls === "add" ? "▌ " : "│ "), cell, el("span", "edge", " │")));
      if (r.cls === "add" && parts.length === 1) adds.push({ cell, text: part, inner });
    }
  }
  nodes.push(ln("rule", rule("╰", "╯")));
  return { nodes, adds };
}

// --- state ------------------------------------------------------------------------------------------------------------

let run = 0; // bumped to cancel whatever is playing
let redraw = null; // repaints the finished view, for a resize
let stopOrb = null;
let stopDecode = null;
let stopGhost = null;
let loopTimer = 0;
let touched = false; // the visitor typed or ran a check: stop replaying the sample on their own
let seen = true; // the block is on screen
const CANCEL = Symbol("cancel");
const wait = (ms, id) => new Promise((resolve, reject) => setTimeout(() => (id === run ? resolve() : reject(CANCEL)), ms));
const clear = () => {
  stopOrb?.();
  stopDecode?.();
  stopOrb = stopDecode = null;
  out.replaceChildren();
};
const setMode = (sample, playing) => {
  mode.textContent = sample ? "Sample run" : "Live check";
  replay.hidden = sample && playing;
};
const say = (text) => (live.textContent = text);

function ghostOn() {
  if (stopGhost || input.value || document.activeElement === input) return;
  field.classList.add("ghosting");
  ghost.hidden = false;
  stopGhost = mountGhost(ghost);
}
function ghostOff() {
  stopGhost?.();
  stopGhost = null;
  ghost.hidden = true;
  ghost.textContent = "";
  field.classList.remove("ghosting");
}

/** A line with an orb and the "Checking..." label. Remove it to stop the orb. */
function checkingLine() {
  const slot = el("span", "orb");
  const row = ln("mut", slot, " Checking...");
  stopOrb = mountOrb(slot);
  return row;
}
const dropChecking = (row) => {
  stopOrb?.();
  stopOrb = null;
  row.remove();
};

/** The command line: `$ node monitor.mjs <url>`. Typed in when `fast` is false. */
async function command(url, id, fast) {
  const typed = el("span", "typed");
  const cursor = el("span", "cur");
  const row = ln("sh", ["$ ", "prompt"], typed, cursor);
  out.append(row);
  const text = `node monitor.mjs ${url}`;
  if (fast) typed.textContent = text;
  else {
    for (let i = 1; i <= text.length; i++) {
      typed.textContent = text.slice(0, i);
      await wait(i === 1 ? 300 : 22 + ((i * 7) % 19), id);
    }
  }
  cursor.remove();
  return row;
}

/** Appends a diff frame row by row. The removed lines settle, the added line decodes out of noise (not under reduced motion). */
async function showDiff(rows, id, fast, step) {
  const { nodes, adds } = frame(URL_.replace("https://", ""), rows, columns());
  const [top, ...rest] = nodes;
  out.append(top);
  await step(220);
  for (const node of rest) {
    const add = adds.find((a) => a.cell.parentNode === node || node.contains(a.cell));
    out.append(node);
    const cell = node.querySelector(".cell");
    if (cell?.classList.contains("del")) {
      cell.classList.add("land");
      if (!fast) requestAnimationFrame(() => requestAnimationFrame(() => cell.classList.add("in")));
      else cell.classList.add("in");
    }
    if (add && !fast) {
      add.cell.textContent = " ".repeat(add.inner);
      stopDecode = decodeLine(add.cell, add.text, add.inner);
      await step(1500);
    } else await step(cell?.classList.contains("del") ? 320 : 120);
  }
}

// --- the sample -------------------------------------------------------------------------------------------------------

/** Plays the sample again a while after it ends, only while the block is on screen and the visitor has not taken over. */
function scheduleLoop() {
  clearTimeout(loopTimer);
  if (reduced.matches) return;
  loopTimer = setTimeout(() => {
    if (touched || mode.textContent !== "Sample run") return;
    if (!seen || document.hidden) return scheduleLoop();
    playSample(false);
  }, 16000);
}

async function playSample(fast) {
  clearTimeout(loopTimer);
  const id = ++run;
  setMode(true, !fast);
  ghostOff();
  clear();
  const step = (ms) => (fast ? Promise.resolve() : wait(ms, id));
  try {
    if (!fast) {
      await command(URL_, id, false);
      await step(450);
      out.append(ln("mut", "Checking 1 URL(s)"));
      await step(300);
      out.append(ln("", "Baseline saved: ", [URL_, "mut"]));
      await step(260);
      out.append(ln("mut", "Credits used this run: 1"));
      await step(1100);
      out.replaceChildren(ln("later", "── 6 hours later ──"));
      await step(1400);
      clear();
    }
    await command(URL_, id, fast);
    if (!fast) {
      const busy = checkingLine();
      out.append(busy);
      await step(1500);
      dropChecking(busy);
    }
    out.append(ln("mut", "Checking 1 URL(s)"));
    await step(240);
    out.append(ln("", ["Changed: ", "strong"], `${URL_} (+1 -2 lines)`));
    await step(260);
    await showDiff(DIFF, id, fast, step);
    out.append(ln("mut", "Credits used this run: 1"));
    redraw = () => playSample(true);
  } catch (e) {
    if (e === CANCEL) return;
    throw e;
  }
  if (id === run) {
    setMode(true, false);
    ghostOn();
    scheduleLoop();
  }
}

// --- a real check -----------------------------------------------------------------------------------------------------

const when = (iso) => (iso ? new Date(iso).toLocaleString() : "the last check");
const NOTE = "Snapshots are shared by URL and kept 7 days.";

/** Paints a /api/check answer into the terminal. */
function showResult(d) {
  const label = LABEL[d.status] || "Error";
  if (d.status === "baseline") {
    out.append(ln("", "Baseline saved: ", [d.url, "mut"]), ln("mut", "Check it again later to see what changed."));
  } else if (d.status === "unchanged") {
    out.append(ln("", "Unchanged: ", [d.url, "mut"]), ln("mut", `Same as the snapshot from ${when(d.previousCheckedAt)}.`));
  } else if (d.status === "changed") {
    out.append(ln("", ["Changed: ", "strong"], `${d.url} (+${d.diff.added} -${d.diff.removed} lines)`));
    const lines = d.diff.text ? d.diff.text.split("\n") : ["(only line order or blank lines changed)"];
    const rows = lines.map((l) => ({ cls: l.startsWith("+") ? "add" : l.startsWith("-") ? "del" : "mut", text: l }));
    const { nodes } = frame(new URL(d.url).hostname, rows, columns());
    for (const n of nodes) {
      n.querySelector(".cell.del")?.classList.add("land", "in");
      out.append(n);
    }
  } else if (d.status === "blocked") {
    out.append(ln("", ["Blocked/unavailable: ", "strong"], d.url || ""));
    if (d.targetStatus) out.append(ln("mut", `The site answered HTTP ${d.targetStatus}. Your last snapshot is untouched.`));
    if (d.message) out.append(ln("mut", d.message));
  } else {
    out.append(ln("", [`${label}: `, "strong"], d.message || "Something went wrong."));
  }
  if (d.commands) out.append(ln("cmds", d.commands));
  if (typeof d.credits === "number") out.append(ln("mut", `Credits used this run: ${d.credits}`));
  if (["baseline", "unchanged", "changed"].includes(d.status)) out.append(ln("mut note", NOTE));
  say(d.status === "changed" ? `Changed: ${d.diff.added} lines added, ${d.diff.removed} removed.` : `${label}. ${d.message || ""}`.trim());
}

async function check(url) {
  touched = true;
  clearTimeout(loopTimer);
  const id = ++run;
  setMode(false);
  ghostOff();
  clear();
  const row = await command(url, id, true);
  const busy = checkingLine();
  out.append(busy);
  go.disabled = true;
  term().setAttribute("aria-busy", "true");
  const token = new FormData(form).get("cf-turnstile-response"); // only present when Turnstile is on
  let data;
  try {
    const res = await fetch("/api/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, turnstile: token || undefined }),
    });
    try {
      data = await res.json();
    } catch {
      data = { status: "error", message: `Unexpected response from the demo (HTTP ${res.status}).` };
    }
  } catch {
    data = { status: "error", message: "Could not reach the demo. Check your connection and try again." };
  } finally {
    if (window.turnstile) window.turnstile.reset(); // a token works once
    go.disabled = false;
    term().removeAttribute("aria-busy");
  }
  if (id !== run) return; // the visitor started something else meanwhile
  dropChecking(busy);
  showResult(data);
  redraw = () => {
    clear();
    out.append(row.cloneNode(true));
    showResult(data);
  };
}
const term = () => out.parentElement;

export function initWatch() {
  mountPulse($("pulse"));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const url = input.value.trim();
    if (!url) {
      ++run;
      setMode(false);
      clear();
      out.append(ln("", ["Check the URL: ", "strong"], "Enter a URL to check."));
      input.focus();
      return;
    }
    check(url);
  });
  replay.addEventListener("click", () => {
    touched = false;
    playSample(reduced.matches);
  });
  if ("IntersectionObserver" in window) new IntersectionObserver((entries) => (seen = entries[entries.length - 1].isIntersecting)).observe(out);
  input.addEventListener("input", () => (touched = true));
  input.addEventListener("focus", ghostOff);
  input.addEventListener("blur", () => {
    if (!input.value) ghostOn();
  });
  let timer;
  let width = innerWidth;
  addEventListener("resize", () => {
    if (innerWidth === width) return; // a phone's address bar moving is not a new layout
    width = innerWidth;
    clearTimeout(timer);
    timer = setTimeout(() => {
      charWidth = 0;
      redraw?.();
    }, 200);
  });
  playSample(reduced.matches);
}
