#!/usr/bin/env bash
# Kokoro (af_heart) narration: one clip per caption into public/audio/. Prints each duration.
# Usage: scripts/narration.sh   (reads the captions below; keep them equal to src/cues.ts)
set -euo pipefail
cd "$(dirname "$0")/.."
SAY=scripts/say.py
say() { uv run -q --python 3.12 --with kokoro --with soundfile python "$SAY" af_heart "public/audio/$1.wav" "$2"; }
say n1 "Watch any page for changes."
say n2 "Run it again. See exactly what changed."
say n3 "Get pinged on Discord or Slack."
say n4 "Free and open source. Built on Spicrawl."
# Measured clip lengths feed the beat sheet (src/cues.ts).
python3 - <<'PY'
import json, wave
d = {}
for k in ("n1", "n2", "n3", "n4"):
    w = wave.open(f"public/audio/{k}.wav")
    d[k] = round(w.getnframes() / w.getframerate(), 3)
json.dump(d, open("src/clips.json", "w"), indent=2)
print(d)
PY
