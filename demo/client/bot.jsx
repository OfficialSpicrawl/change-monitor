// The agent avatar. Its own chunk (bot-avatars is the heaviest library), loaded when the transcript is near the viewport.
import { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { BotAvatar } from "bot-avatars";
import { botState } from "./store.js";

function Bot() {
  const state = useSyncExternalStore(botState.subscribe, botState.get, () => "default");
  return <BotAvatar type="droid" state={state} size={44} aria-label={state === "working" ? "Agent, working" : "Agent, idle"} />;
}

export const mountBot = (node) => createRoot(node).render(<Bot />);
