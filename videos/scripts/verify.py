"""Check the rendered deliverables by decoding them (adapted from the product-film skill's verify.py).

    uv run --with numpy python3 scripts/verify.py out/change-monitor/v1

Checks: MP4 duration 15-20 s and equal to the cue sheet, 1920x1080, H.264 + AAC present, frame 0 decodes
to the ground #16181B (centre and corner, within 2), loudness near -16 LUFS, GIF is 960 px wide, <= 8 MB,
silent, loops forever, ground decodes right. Exits non-zero when a check fails.
"""
import json, re, subprocess, sys, os
import numpy as np

folder = sys.argv[1]
BG = np.array([0x16, 0x18, 0x1B])
mp4, gif, poster = (os.path.join(folder, n) for n in ("change-monitor.mp4", "change-monitor.gif", "poster.png"))
ok_all = True


def check(name, ok, detail):
    global ok_all
    ok_all &= bool(ok)
    print(f"{'ok   ' if ok else 'FAIL '}{name}: {detail}")


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path], capture_output=True, text=True).stdout
    return json.loads(out)


def frame(path, index, w, h, vf=""):
    sel = f"select=eq(n\\,{index})" + (f",{vf}" if vf else "")
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", sel, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(h, w, 3).astype(int)


cues = json.loads(subprocess.run(["bun", "-e", 'import {DURATION} from "./src/cues.ts"; console.log(JSON.stringify({d: DURATION}))'], capture_output=True, text=True).stdout)
info = probe(mp4)
v = next(s for s in info["streams"] if s["codec_type"] == "video")
a = [s for s in info["streams"] if s["codec_type"] == "audio"]
dur = float(info["format"]["duration"])
check("mp4 duration", 15 <= dur <= 20 and abs(dur - cues["d"]) < 0.05, f"{dur:.3f}s (cue sheet {cues['d']}s)")
check("mp4 video", v["codec_name"] == "h264" and (v["width"], v["height"]) == (1920, 1080) and v["r_frame_rate"] == "30/1", f"{v['codec_name']} {v['width']}x{v['height']} {v['r_frame_rate']} {v['pix_fmt']} {v.get('color_space')}")
check("mp4 audio", len(a) == 1 and a[0]["codec_name"] == "aac", f"{[(s['codec_name'], s['sample_rate'], s['channels']) for s in a]}")
f0 = frame(mp4, 0, 1920, 1080)
for name, px in (("centre", f0[540, 960]), ("corner", f0[5, 5]), ("far corner", f0[1074, 1914])):
    check(f"mp4 frame 0 {name}", np.all(np.abs(px - BG) <= 2), f"{px.tolist()} want {BG.tolist()}")
ebur = subprocess.run(["ffmpeg", "-nostats", "-i", mp4, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
lufs = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", ebur)[-1])
peak = float(re.findall(r"Peak:\s+(-?[\d.]+) dBFS", ebur)[-1])
check("mp4 loudness", abs(lufs + 16) <= 1.5 and peak <= -1.0, f"{lufs} LUFS integrated, true peak {peak} dBFS")

g = probe(gif)
gv = g["streams"][0]
size = os.path.getsize(gif) / 1e6
loop = subprocess.run(["bash", "-c", f"head -c 1024 '{gif}' | grep -c NETSCAPE"], capture_output=True, text=True).stdout.strip()
check("gif", gv["width"] == 960 and size <= 8 and len(g["streams"]) == 1 and loop != "0", f"{gv['width']}x{gv['height']} {size:.2f} MB, streams {len(g['streams'])}, loop extension {'yes' if loop != '0' else 'NO'}, {float(g['format']['duration']):.2f}s")
gf0 = frame(gif, 0, gv["width"], gv["height"])
px = gf0[gv["height"] // 2, gv["width"] // 2]
check("gif frame 0 ground", np.all(np.abs(px - BG) <= 3), f"{px.tolist()}")
pp = probe(poster)["streams"][0]
pimg = frame(poster, 0, pp["width"], pp["height"])
check("poster", (pp["width"], pp["height"]) == (1920, 1080) and np.all(np.abs(pimg[5, 5] - BG) <= 2), f"{pp['width']}x{pp['height']}, corner {pimg[5, 5].tolist()}")
sys.exit(0 if ok_all else 1)
