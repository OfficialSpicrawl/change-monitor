// The libraries.dev effects that are React components: border-beam on the install command, and the thinking orb.
// Everything else on the page is plain DOM code.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BorderBeam } from "border-beam";
import { ThinkingOrb } from "thinking-orbs";

const REPO = "https://github.com/OfficialSpicrawl/change-monitor";
const TABS = [
  { id: "skill", label: "Agent skill", cmd: "npx skills add OfficialSpicrawl/change-monitor" },
  { id: "cli", label: "CLI", cmd: `git clone ${REPO} && cd change-monitor && npm install` },
];

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.className = "sr-only";
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {}
    area.remove();
    return ok;
  }
}

const Icon = ({ done }) => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {done ? <path d="M3 8.5l3.2 3.2L13 4.8" /> : <><rect x="5.5" y="5.5" width="8" height="8" rx="1.8" /><path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" /></>}
  </svg>
);

// On a phone the beam is the one effect that costs real frame time, so there the command is simply a box.
const phone = () => matchMedia("(max-width: 639px)").matches;

function Install() {
  const [tab, setTab] = useState(0);
  const [plain] = useState(phone);
  const [copied, setCopied] = useState(false);
  const { cmd } = TABS[tab];
  const copy = async () => {
    if (!(await copyText(cmd))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const box = (
    <div className="cmd">
      <code>
        <span className="prompt" aria-hidden="true">$ </span>
        {cmd}
      </code>
      <button type="button" className="copy" onClick={copy} aria-label="Copy install command">
        <Icon done={copied} />
      </button>
    </div>
  );
  return (
    <>
      {plain ? box : <BorderBeam size="pulse-inner" colorVariant="mono" theme="dark" strength={1}>{box}</BorderBeam>}
      <div className="tabs" role="group" aria-label="Install with">
        {TABS.map((t, i) => (
          <button key={t.id} type="button" className="tab" aria-pressed={tab === i} onClick={() => { setTab(i); setCopied(false); }}>
            {t.label}
          </button>
        ))}
      </div>
      <span className="sr-only" role="status">{copied ? "Copied to clipboard" : ""}</span>
    </>
  );
}

export const mountInstall = (node) => createRoot(node).render(<Install />);

/** Renders a small orb into `node` and returns the function that removes it. */
export function mountOrb(node) {
  const root = createRoot(node);
  root.render(<ThinkingOrb state="searching" size={20} theme="dark" aria-hidden="true" />);
  return () => root.unmount();
}
