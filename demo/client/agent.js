// The agent chat is a live terminal: the command types in, the real CLI output (the README's) prints, then a check mark.
// The avatar is "working" while the command runs and idle otherwise. It plays when the chat scrolls into view, loops slowly
// while it stays there, and pauses off screen. Under reduced motion (or without IntersectionObserver) the finished chat is
// just shown, which is also what the HTML holds.
import { botState } from "./store.js";

const COMMAND = "node monitor.mjs";
const OUTPUT = [
  ["Baseline saved: ", "https://example.com"],
  ["Baseline saved: ", "https://www.iana.org/help/example-domains"],
  ["Baseline saved: ", "https://en.wikipedia.org/wiki/Main_Page"],
];
const CREDITS = "Credits used this run: 3";
const DONE = "\u2713 Baselines saved for 3 pages.";
const PAUSE = Symbol("pause");

const line = (cls, ...parts) => {
  const row = document.createElement("div");
  row.className = `ln ${cls}`.trim();
  for (const p of parts) {
    if (typeof p === "string") row.append(p);
    else {
      const span = document.createElement("span");
      span.className = p[1];
      span.textContent = p[0];
      row.append(span);
    }
  }
  return row;
};

export function initAgent() {
  const chat = document.getElementById("chat");
  const out = document.getElementById("chat-out");
  if (!chat || !out) return;
  const bot = document.getElementById("bot");
  if (bot) {
    // The avatar library is its own chunk: load it shortly before the chat scrolls into view.
    const load = () => import("./bot.jsx").then((m) => m.mountBot(bot));
    if (!("IntersectionObserver" in window)) load();
    else {
      const near = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        near.disconnect();
        load();
      }, { rootMargin: "700px" });
      near.observe(chat);
    }
  }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;

  let visible = false;
  let running = false;
  let run = 0;
  const wait = (ms, id) => new Promise((resolve, reject) => setTimeout(() => (id === run && visible ? resolve() : reject(PAUSE)), ms));

  async function play() {
    const id = ++run;
    running = true;
    try {
      out.replaceChildren();
      botState.set("working");
      const typed = document.createElement("span");
      const cursor = document.createElement("span");
      cursor.className = "cur";
      const cmd = line("sh", ["$ ", "prompt"], typed, cursor);
      out.append(cmd);
      for (let i = 1; i <= COMMAND.length; i++) {
        typed.textContent = COMMAND.slice(0, i);
        await wait(i === 1 ? 500 : 45 + ((i * 11) % 23), id);
      }
      cursor.remove();
      await wait(450, id);
      for (const [label, url] of OUTPUT) {
        out.append(line("", label, [url, "mut"]));
        await wait(320, id);
      }
      out.append(line("mut", CREDITS));
      await wait(500, id);
      out.append(line("ok", DONE));
      botState.set("default");
      await wait(9000, id); // holds the finished frame, then plays again
    } catch (e) {
      if (e !== PAUSE) throw e;
      running = false;
      return;
    }
    running = false;
    if (visible) play();
  }

  new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible && !running) play();
  }, { threshold: 0.5 }).observe(chat);
}
