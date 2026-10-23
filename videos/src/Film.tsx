import { loadFont } from "@remotion/fonts";
import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, Img, staticFile } from "remotion";
import { B2, B3, B4, CAPTION_CUES, END, NOTIFY, RUN1, RUN2, WINDOW_IN } from "./cues";
import { TargetLog } from "./kit/debug";
import { progress, useTime } from "./kit/time";
import { C, EASE, FONT, RADIUS } from "./tokens";

// Fonts are local files (copied from webora-ui/landing/node_modules, see BRAND.md).
loadFont({ family: "Inter", url: staticFile("fonts/inter-latin-wght-normal.woff2"), weight: "100 900" });
loadFont({ family: "JetBrains Mono", url: staticFile("fonts/jetbrains-mono-latin-wght-normal.woff2"), weight: "100 800" });

export type FilmProps = { fps: number; debug: boolean };

// ---- motion helpers: every value is a function of t -------------------------------------------

const ease = Easing.bezier(EASE[0], EASE[1], EASE[2], EASE[3]);

/** Blur in and rise: 0 before `start`, settled after `start + len`. */
function enter(t: number, start: number, { len = 0.5, rise = 24, blur = 14 } = {}): CSSProperties {
  const p = ease(progress(t, start, len));
  if (p <= 0) return { opacity: 0 };
  return {
    opacity: p,
    translate: p >= 1 ? undefined : `0 ${(1 - p) * rise}px`,
    filter: p >= 1 ? undefined : `blur(${(1 - p) * blur}px)`,
  };
}

const hash = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
/** Time the i-th typed character lands: even pace with a small, deterministic wobble. */
const charTime = (start: number, speed: number, i: number) => start + i * speed + (hash(i) - 0.5) * speed * 0.8;

// ---- terminal -----------------------------------------------------------------------------------

type Seg = readonly [text: string, color: string, weight?: number];
type Row = {
  at: number;
  segs: Seg[];
  prompt?: boolean; // draws "$ " before the segs
  type?: { start: number; speed: number; enter: number }; // segs are typed; Enter at `enter`
  cursor?: boolean; // a block cursor after the text (typed rows: until Enter; others: from `at` on)
  bar?: boolean; // an added line: brighter, on the elevated surface
};

const MONO = 28;
const LINE = 44;
const PAD = 40;
const WINDOW = { x: 120, y: 100, w: 1680, h: 664, head: 56 };

const typedCount = (row: Row, t: number) => {
  if (!row.type) return row.segs.reduce((n, s) => n + s[0].length, 0);
  const total = row.segs.reduce((n, s) => n + s[0].length, 0);
  let n = 0;
  while (n < total && charTime(row.type.start, row.type.speed, n) <= t) n++;
  return n;
};

const sliceSegs = (segs: Seg[], n: number) => {
  const out: Seg[] = [];
  let left = n;
  for (const s of segs) {
    if (left <= 0) break;
    out.push([s[0].slice(0, left), s[1], s[2]]);
    left -= s[0].length;
  }
  return out;
};

const PROMPT: Seg = ["$ ", C.fg, 700];

function Cursor({ on }: { on: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: Math.round(MONO * 0.6),
        height: Math.round(MONO * 1.15),
        marginLeft: 1,
        verticalAlign: -6,
        background: C.fg,
        opacity: on ? 1 : 0,
      }}
    />
  );
}

function TermRow({ row, t }: { row: Row; t: number }) {
  if (t < row.at) return null;
  const n = typedCount(row, t);
  const typed = row.type ? sliceSegs(row.segs, n) : row.segs;

  let cursorOn = false;
  if (row.cursor && t < (row.type ? row.type.enter : Infinity)) {
    // solid while characters are landing, then a 1 Hz blink counted from the last one
    const lastChar = row.type && n > 0 ? charTime(row.type.start, row.type.speed, n - 1) : row.at;
    cursorOn = t - lastChar < 0.4 || Math.floor((t - lastChar) * 2) % 2 === 0;
  }
  const barP = row.bar ? ease(progress(t, row.at, 0.3)) : 0;
  return (
    <div
      style={{
        height: LINE,
        display: "flex",
        alignItems: "center",
        whiteSpace: "pre",
        margin: row.bar ? `0 -${PAD}px` : undefined,
        padding: row.bar ? `0 ${PAD - 3}px` : undefined,
        borderLeft: row.bar ? `3px solid rgba(249,249,249,${barP})` : undefined,
        background: row.bar ? `rgba(38,41,45,${barP})` : undefined,
      }}
    >
      <span>
        {row.prompt ? <span style={{ color: PROMPT[1], fontWeight: PROMPT[2] }}>{PROMPT[0]}</span> : null}
        {typed.map((s, i) => (
          <span key={i} style={{ color: s[1], fontWeight: s[2] ?? 400 }}>
            {s[0]}
          </span>
        ))}
        {row.cursor ? <Cursor on={cursorOn} /> : null}
      </span>
    </div>
  );
}

const gap = (at: number): Row => ({ at, segs: [] });

const url = (s: string): Seg => [s, C.string];
const RUN1_ROWS: Row[] = [
  {
    at: RUN1.catStart - 0.35,
    prompt: true,
    cursor: true,
    type: { start: RUN1.catStart, speed: 0.05, enter: RUN1.catStart + 0.8 },
    segs: [["cat", C.fg], [" urls.txt", C.string]],
  },
  { at: RUN1.urls[0], segs: [url("https://example.com")] },
  { at: RUN1.urls[1], segs: [url("https://www.iana.org/help/example-domains")] },
  { at: RUN1.urls[2], segs: [url("https://en.wikipedia.org/wiki/Main_Page")] },
  {
    at: RUN1.nodeStart - 0.3,
    prompt: true,
    cursor: true,
    type: { start: RUN1.nodeStart, speed: 0.045, enter: RUN1.enter },
    segs: [["node", C.fg], [" monitor.mjs", C.string]],
  },
  gap(RUN1.header),
  { at: RUN1.header, segs: [["[2026-10-23T11:13:00.601Z] Checking 3 URL(s)", C.muted]] },
  { at: RUN1.baselines[0], segs: [["Baseline saved: ", C.string], ["https://example.com", C.muted]] },
  { at: RUN1.baselines[1], segs: [["Baseline saved: ", C.string], ["https://www.iana.org/help/example-domains", C.muted]] },
  { at: RUN1.baselines[2], segs: [["Baseline saved: ", C.string], ["https://en.wikipedia.org/wiki/Main_Page", C.muted]] },
  { at: RUN1.credits, segs: [["Credits used this run: 3", C.muted]] },
  { at: RUN1.prompt, prompt: true, cursor: true, segs: [] },
];

const RUN2_ROWS: Row[] = [
  {
    at: RUN2.nodeStart - 0.3,
    prompt: true,
    cursor: true,
    type: { start: RUN2.nodeStart, speed: RUN2.speed, enter: RUN2.enter },
    segs: [["node", C.fg], [" monitor.mjs", C.string], [" https://example.com", C.string]],
  },
  gap(RUN2.header),
  { at: RUN2.header, segs: [["[2026-10-23T11:13:20.137Z] Checking 1 URL(s)", C.muted]] },
  { at: RUN2.changed, segs: [["Changed: ", C.fg, 700], ["https://example.com", C.fg], [" (+1 -2 lines)", C.fg]] },
  { at: RUN2.diff[0], segs: [["- This domain is for use in docs (old wording) examples without needing permission. ...", C.removed]] },
  { at: RUN2.diff[1], segs: [["- An old line that was removed.", C.removed]] },
  { at: RUN2.diff[2], bar: true, segs: [["+ This domain is for use in documentation examples without needing permission. ...", C.fg, 500]] },
  { at: RUN2.credits, segs: [["Credits used this run: 1", C.muted]] },
  { at: RUN2.prompt, prompt: true, cursor: true, segs: [] },
];

function Terminal({ t }: { t: number }) {
  const rows = t < B2 ? RUN1_ROWS : RUN2_ROWS;
  return (
    <div
      data-target="window"
      style={{
        position: "absolute",
        left: WINDOW.x,
        top: WINDOW.y,
        width: WINDOW.w,
        height: WINDOW.h,
        overflow: "hidden",
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: RADIUS,
        boxShadow: "0 30px 80px rgba(0,0,0,0.4)",
        ...enter(t, WINDOW_IN, { len: 0.55, rise: 28, blur: 12 }),
      }}
    >
      <div
        style={{
          height: WINDOW.head,
          display: "flex",
          alignItems: "center",
          padding: `0 ${PAD}px`,
          background: C.chrome,
          borderBottom: `1px solid ${C.chromeLine}`,
          fontFamily: FONT.mono,
          fontSize: 22,
          letterSpacing: "0.02em",
          color: C.muted,
        }}
      >
        change-monitor
      </div>
      <div style={{ padding: `${PAD - 8}px ${PAD}px`, fontFamily: FONT.mono, fontVariantLigatures: "none", fontSize: MONO, lineHeight: `${LINE}px`, color: C.fg }}>
        {rows.map((row, i) => (
          <TermRow key={i} row={row} t={t} />
        ))}
      </div>
    </div>
  );
}

// ---- beat 3: the notification card ----------------------------------------------------------------

function Mark({ width, style }: { width: number; style?: CSSProperties }) {
  return <Img src={staticFile("brand/mark.svg")} style={{ width, height: (width * 333) / 472, display: "block", ...style }} />;
}

function Notify({ t }: { t: number }) {
  const chip = (label: string, at: number): ReactNode => (
    <div
      style={{
        fontFamily: FONT.mono,
        fontSize: 28,
        padding: "12px 22px",
        color: C.muted,
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: RADIUS,
        ...enter(t, at, { len: 0.45, rise: 18, blur: 10 }),
      }}
    >
      {label}
    </div>
  );
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div style={{ position: "absolute", top: 230, display: "flex", gap: 24 }}>
        {chip("DISCORD_WEBHOOK_URL", NOTIFY.chips[0])}
        {chip("SLACK_WEBHOOK_URL", NOTIFY.chips[1])}
      </div>
      <div
        data-target="card"
        style={{
          position: "absolute",
          top: 380,
          width: 1240,
          padding: "36px 44px 44px",
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: RADIUS,
          boxShadow: "0 30px 80px rgba(0,0,0,0.4)",
          ...enter(t, NOTIFY.card, { len: 0.6, rise: 36, blur: 16 }),
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: RADIUS,
              background: C.elevated,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Mark width={44} />
          </div>
          <div style={{ fontFamily: FONT.ui, fontWeight: 600, fontSize: 30, color: C.fg }}>Change monitor</div>
          <div style={{ marginLeft: "auto", fontFamily: FONT.ui, fontSize: 26, color: C.muted }}>just now</div>
        </div>
        <div style={{ marginTop: 30, fontFamily: FONT.mono, fontVariantLigatures: "none", fontSize: 40, color: C.fg, whiteSpace: "pre" }}>
          <span style={{ fontWeight: 700 }}>Changed: </span>https://example.com (+1 -2 lines)
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ---- beat 4: the end card -------------------------------------------------------------------------

function EndCard({ t }: { t: number }) {
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <Img
        src={staticFile("brand/lockup.svg")}
        style={{ position: "absolute", top: 150, width: 660, height: (660 * 112) / 500, ...enter(t, END.lockup, { len: 0.6, rise: 20, blur: 14 }) }}
      />
      <div
        data-target="title"
        style={{
          position: "absolute",
          top: 330,
          fontFamily: FONT.ui,
          fontWeight: 700,
          fontSize: 104,
          letterSpacing: "-0.02em",
          color: C.fg,
          ...enter(t, END.title, { len: 0.6, rise: 30, blur: 16 }),
        }}
      >
        Change monitor
      </div>
      <div
        data-target="repo"
        style={{ position: "absolute", top: 510, fontFamily: FONT.mono, fontSize: 38, color: C.fg, ...enter(t, END.repo, { len: 0.5, rise: 20, blur: 10 }) }}
      >
        github.com/OfficialSpicrawl/change-monitor
      </div>
      <div
        data-target="site"
        style={{ position: "absolute", top: 580, fontFamily: FONT.mono, fontSize: 38, color: C.muted, ...enter(t, END.site, { len: 0.5, rise: 20, blur: 10 }) }}
      >
        change-monitor.spicrawl.com
      </div>
    </AbsoluteFill>
  );
}

// ---- captions: one short line in a fixed band, blur-swapping ---------------------------------------

function Captions({ t }: { t: number }) {
  return (
    <>
      {CAPTION_CUES.map((cue, i) => {
        const next = CAPTION_CUES[i + 1];
        const exitStart = next ? next.t - 0.05 : Infinity;
        if (t < cue.t) return null;
        const out = ease(progress(t, exitStart, 0.25));
        if (out >= 1) return null;
        const inn = enter(t, cue.t, { len: 0.45, rise: 24, blur: 14 });
        const style: CSSProperties =
          out > 0 ? { opacity: 1 - out, filter: `blur(${out * 12}px)`, translate: `0 ${-out * 14}px` } : inn;
        return (
          <div
            key={cue.text}
            data-target={`caption${i + 1}`}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 860,
              textAlign: "center",
              fontFamily: FONT.ui,
              fontWeight: 600,
              fontSize: 64,
              letterSpacing: "-0.01em",
              color: C.fg,
              whiteSpace: "pre",
              ...style,
            }}
          >
            {cue.text}
          </div>
        );
      })}
    </>
  );
}

export const Film = ({ debug }: FilmProps) => {
  const t = useTime();
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {t < B3 ? <Terminal t={t} /> : t < B4 ? <Notify t={t} /> : <EndCard t={t} />}
      <Captions t={t} />
      {debug ? <TargetLog /> : null}
    </AbsoluteFill>
  );
};
