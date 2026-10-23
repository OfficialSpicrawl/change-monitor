// The beat sheet as data, in seconds. Scene code never holds a literal time.
// There is no music, so the grid is the narration: measured clip lengths (src/clips.json,
// written by scripts/narration.sh) decide how long each beat must be.
import clips from "./clips.json";

export const FPS = 30; // preview/delivery fps; the final render uses 4x subframes for motion blur
export const CAPTION_LEAD = 0.3; // a caption is on screen this long before its voice starts

export const CAPTIONS = {
  n1: "Watch any page for changes.",
  n2: "Run it again. See exactly what changed.",
  n3: "Get pinged on Discord or Slack.",
  n4: "Free and open source. Built on Spicrawl.",
} as const;
export type ClipId = keyof typeof CAPTIONS;
export const CLIP: Record<ClipId, number> = clips;

// Scene (beat) starts. Hard cuts land here.
export const B1 = 0;
export const B2 = 5.6;
export const B3 = B2 + 5.3;
export const B4 = B3 + 3.2;

// Voice starts. Each clip must end before the next beat's caption swaps in.
export const VOICE: Record<ClipId, number> = {
  n1: 0.55,
  n2: B2 + CAPTION_LEAD,
  n3: B3 + CAPTION_LEAD,
  n4: B4 + CAPTION_LEAD,
};
export const DURATION = Math.round((B4 + CAPTION_LEAD + CLIP.n4 + 0.9) * 30) / 30;

export const CAPTION_CUES: { t: number; text: string }[] = (Object.keys(CAPTIONS) as ClipId[]).map((id) => ({
  t: VOICE[id] - CAPTION_LEAD,
  text: CAPTIONS[id],
}));

// Window (terminal) opens just after frame 0, so frame 0 is pure ground.
export const WINDOW_IN = 0.1;
export const TYPE_SPEED = 0.045; // s per character of a typed command (run 2 types faster)

// Run 1: `cat urls.txt`, then `node monitor.mjs` (three baselines).
export const RUN1 = {
  catStart: B1 + 0.6,
  urls: [B1 + 1.45, B1 + 1.55, B1 + 1.65],
  nodeStart: B1 + 2.0,
  enter: B1 + 3.1,
  header: B1 + 3.2,
  baselines: [B1 + 3.7, B1 + 4.2, B1 + 4.7],
  credits: B1 + 5.1,
  prompt: B1 + 5.35,
};

// Run 2: `node monitor.mjs https://example.com` (one change, shown as a diff).
export const RUN2 = {
  nodeStart: B2 + 0.45,
  speed: 0.032,
  enter: B2 + 1.95,
  header: B2 + 2.05,
  changed: B2 + 2.55,
  diff: [B2 + 2.9, B2 + 3.15, B2 + 3.4],
  credits: B2 + 3.95,
  prompt: B2 + 4.25,
};

// Beat 3: the notification card.
export const NOTIFY = {
  chips: [B3 + 0.25, B3 + 0.4],
  card: B3 + 0.75,
};

// Beat 4: the end card.
export const END = {
  lockup: B4 + 0.1,
  title: B4 + 0.35,
  repo: B4 + 0.7,
  site: B4 + 0.9,
};
