// Spicrawl's own theme (.spicrawl-theme in webora-ui/landing/src/styles/globals.css), as hex:
// anything that animates must be hex. White is the only accent; code is luminance steps, not hue.
export const C = {
  bg: "#16181B",
  card: "#1E2124",
  elevated: "#26292D",
  border: "#2E3135",
  chrome: "#1B1D20", // TerminalFrame header: background at 40% over card
  chromeLine: "#292C30", // border at 70% over card
  fg: "#F9F9F9",
  muted: "#A9ADB2",
  // luminance steps (keyword brightest, then string, number, flag, comment)
  string: "#D5D7DA",
  number: "#A9ADB2",
  flag: "#8F9398",
  comment: "#868A90",
  removed: "#7E8288", // dimmer than muted: a removed line
} as const;

export const FONT = {
  ui: "Inter, sans-serif",
  mono: "'JetBrains Mono', monospace",
} as const;

export const RADIUS = 10;
export const EASE = [0.22, 1, 0.36, 1] as const; // the brand's cubic-bezier(0.22, 1, 0.36, 1)
