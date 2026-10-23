import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { B3, DURATION, FPS, VOICE, type ClipId } from "../src/cues";

/**
 * Final render of the change-monitor film.
 *
 *   bun scripts/render.ts v1 [--concurrency 4]
 *
 * 1. master: 4 subframes per delivered frame (120 fps), PNG frames, H.264 CRF 8 yuv444p, muted
 * 2. narration: Kokoro clips placed at their cue times, padded to the film length, -16 LUFS, 48 kHz
 * 3. motion blur: tmix 4 -> 30 fps, one colour conversion (master is limited range BT.601, untagged)
 * 4. deliverables in out/change-monitor/<version>/: change-monitor.mp4, .gif (silent, 960 px), poster.png
 * Uses the system ffmpeg (6.1), which has tmix/select/tile.
 */
const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const version = args.find((a) => /^v\d+$/.test(a)) ?? "v1";
const concurrency = flag("--concurrency", "4");

const root = resolve(import.meta.dirname, "..");
const out = join(root, "out", "change-monitor", version);
const work = join(out, "work");
mkdirSync(work, { recursive: true });
const run = (cmd: string, list: string[]) => execFileSync(cmd, list, { cwd: root, stdio: "inherit" });
const ff = (list: string[]) => run("ffmpeg", ["-v", "error", "-y", ...list]);

const master = join(work, "master-120.mp4");
const narration = join(work, "narration.wav");
const blurred = join(work, "blurred-30.mov");
const mp4 = join(out, "change-monitor.mp4");
const gif = join(out, "change-monitor.gif");
const poster = join(out, "poster.png");

// 1. master
run("npx", ["remotion", "render", "src/index.ts", "ChangeMonitor", master, "--props", JSON.stringify({ fps: FPS * 4 }), "--codec", "h264", "--crf", "8", "--pixel-format", "yuv444p", "--image-format", "png", "--muted", "--concurrency", concurrency, "--log", "error"]);

// 2. narration at the cue times
const ids = Object.keys(VOICE) as ClipId[];
const inputs = ids.flatMap((id) => ["-i", join(root, "public/audio", `${id}.wav`)]);
const delays = ids.map((id, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=mono,adelay=${Math.round(VOICE[id] * 1000)}:all=1[a${i}]`).join(";");
const mix = `${delays};${ids.map((_, i) => `[a${i}]`).join("")}amix=inputs=${ids.length}:normalize=0,apad=whole_dur=${DURATION},atrim=0:${DURATION},loudnorm=I=-16:TP=-1.5:LRA=7`;
ff([...inputs, "-filter_complex", mix, "-ar", "48000", "-ac", "2", narration]);

// 3. motion blur, then one colour conversion: BT.601 limited in, BT.709 limited out
ff([
  "-i", master,
  "-vf", `tmix=frames=4:weights='1 1 1 1',select='not(mod(n+1\\,4))',setpts=N/(${FPS}*TB),scale=in_range=tv:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv444p10le`,
  "-r", String(FPS), "-c:v", "prores_ks", "-profile:v", "4444", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv",
  blurred,
]);

// 4. deliverables
const h264 = ["-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-x264-params", "colorprim=bt709:transfer=bt709:colormatrix=bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv", "-movflags", "+faststart"];
ff(["-i", blurred, "-i", narration, ...h264, "-c:a", "aac", "-b:a", "192k", "-shortest", mp4]);
// GIF from the final MP4 (so it decodes through the same colour path): 960 px, 15 fps, one palette, loops forever.
ff(["-i", mp4, "-vf", "fps=15,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=256:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle", "-loop", "0", gif]);

// poster: the payoff, the alert card once it has settled
ff(["-ss", String(B3 + 2.2), "-i", mp4, "-frames:v", "1", poster]);

rmSync(master);
rmSync(blurred);
for (const f of ["change-monitor.mp4", "change-monitor.gif", "poster.png"]) console.log(`${f}: ${(statSync(join(out, f)).size / 1e6).toFixed(2)} MB`);
