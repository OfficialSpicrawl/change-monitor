// ascii.rest pieces on this page. A piece is { meta, default(options) => frame(t) }, and mount() draws it into an element,
// pausing it off screen and holding its first frame under reduced motion. These wrappers crop or align a library piece.
// ascii.rest: https://ascii.rest (MIT, Copyright (c) 2026 bas3line).
// Imported by file, not from "ascii.rest": the package's index also exports a loader that bundles all 217 pieces.
import { mount } from "../../node_modules/ascii.rest/dist/mount.js";
import * as heartbeat from "../../node_modules/ascii.rest/dist/pieces/heartbeat.js";
import * as typewriter from "../../node_modules/ascii.rest/dist/pieces/typewriter.js";
import * as decode from "./pieces/scramble.js";

const reshape = (piece, pick, meta) => ({
  meta: { ...piece.meta, ...meta },
  default: (options) => {
    const frame = piece.default(options);
    return (t, env) => pick(frame(t, env));
  },
});

// "Watching": the heartbeat piece's trace and dotted grid, without its labels and bpm readout.
const pulse = reshape(heartbeat, (s) => s.split("\n").slice(3, 12).map((l) => l.slice(0, 49).trimEnd()).join("\n"), { cols: 49, rows: 9 });
export const mountPulse = (el) => mount(el, pulse);
/** The pulse's first frame, which the Worker puts in the HTML so it paints at once and holds still without a script. */
export const pulseFrame = () => pulse.default()(0);

// The ghost of the URL field: example pages typed and deleted behind a cursor, on one left-aligned line.
const ghost = reshape(typewriter, (s) => s.split("\n")[1].trimStart(), { cols: 44, rows: 1 });
const PHRASES = ["https://example.com", "https://acme.dev/pricing", "https://status.acme.dev", "https://acme.dev/docs"];
export const mountGhost = (el) => mount(el, ghost, { prefix: "", phrases: PHRASES });

// A line that decodes out of flickering glyphs into `to`, once, then holds still. Returns the stop function.
const line = reshape(decode, (s) => s, { cols: 80, rows: 1 });
export function decodeLine(el, to, cols, done) {
  const stop = mount(el, line, { phrases: ["", to], cols });
  const timer = setTimeout(() => {
    stop();
    el.textContent = to.padEnd(cols);
    done?.();
  }, 700 + 200 + cols * 14 + 350);
  return () => {
    clearTimeout(timer);
    stop();
  };
}
