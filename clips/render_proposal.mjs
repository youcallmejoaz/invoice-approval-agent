// Renders clips/proposal_cut.mp4 from the Phase 3 clips and the scene WAVs made by clips/tts.py.
//   node clips/render_proposal.mjs [--silent]
// Rules: scene length = voice + 0.5 s (+ up to 1.5 s breathing room on UI scenes 2 to 6), clips are trimmed or hold
// their last frame, never sped up more than 1.25x, 0.3 s crossfade from the opening card into the UI, 5% push-in on
// shots longer than 8 s, voice normalised to about -16 LUFS. No captions, no music.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CLIPS = path.dirname(new URL(import.meta.url).pathname);
const TMP = path.join(CLIPS, ".tmp", "cut");
const VO = path.join(CLIPS, ".tmp", "vo");
const silent = process.argv.includes("--silent");
fs.mkdirSync(TMP, { recursive: true });

const XFADE = 0.3;
const BREATHE = 1.5;
// Each shot: clip file, where to start in it (s), and its share of the scene.
const SCENES = [
  { n: 1, shots: [{ clip: "K01_problem.mp4", from: 0, share: 1 }], breathe: 0 },
  { n: 2, shots: [{ clip: "C01_upload.mp4", from: 0.4, share: 0.42 }, { clip: "C02_board.mp4", from: 4.0, share: 0.58 }], breathe: BREATHE },
  { n: 3, shots: [{ clip: "C03_invoice_detail.mp4", from: 0.5, share: 1 }], breathe: BREATHE },
  { n: 4, shots: [{ clip: "C04_duplicate_blocked_close.mp4", from: 0.2, share: 0.52 }, { clip: "C05_maths_error_close.mp4", from: 0.2, share: 0.48 }], breathe: BREATHE },
  { n: 5, shots: [{ clip: "C06_manager_approves.mp4", from: 1.6, share: 1 }], breathe: BREATHE },
  { n: 6, shots: [{ clip: "C07_ledger_retry.mp4", from: 2.8, share: 0.55 }, { clip: "C08_dashboard_audit.mp4", from: 0.6, share: 0.45 }], breathe: BREATHE },
  { n: 7, shots: [{ clip: "K04_offer.mp4", from: 0, share: 1 }], breathe: 0 },
];

const run = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args]);
const probe = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());

const plan = [];
for (const s of SCENES) {
  const voice = silent ? 0 : probe(path.join(VO, `scene${s.n}.wav`));
  const dur = (silent ? 7 : voice) + 0.5 + s.breathe;
  plan.push({ ...s, voice, dur });
}
const total = plan.reduce((a, s) => a + s.dur, 0);
console.log(plan.map((s) => `scene ${s.n}: voice ${s.voice.toFixed(2)} s -> ${s.dur.toFixed(2)} s`).join("\n"));
console.log(`total ${total.toFixed(2)} s`);
if (total < 60 || total > 90) throw new Error(`Total ${total.toFixed(1)} s is outside 60 to 90 s. Adjust the narration or breathing room.`);

// 1. one video file per scene
const sceneFiles = [];
for (const [i, s] of plan.entries()) {
  const sceneDur = s.dur + (i === 0 ? XFADE : 0);
  const shotFiles = [];
  for (const [k, shot] of s.shots.entries()) {
    const d = sceneDur * shot.share;
    const src = path.join(CLIPS, shot.clip);
    const avail = probe(src) - shot.from;
    const speed = Math.min(1.25, Math.max(1, avail / d));
    const take = Math.min(avail, d * speed);
    const hold = Math.max(0, d - take / speed);
    const push = d > 8 ? `,scale=w='trunc(1920*(1+0.05*t/${d.toFixed(3)})/2)*2':h=-2:eval=frame:flags=lanczos,crop=1920:1080` : "";
    const out = path.join(TMP, `s${s.n}_${k}.mp4`);
    run(["-ss", String(shot.from), "-t", take.toFixed(3), "-i", src, "-an", "-vf",
      `setpts=(PTS-STARTPTS)/${speed.toFixed(4)},fps=30,tpad=stop_mode=clone:stop_duration=${hold.toFixed(3)},trim=duration=${d.toFixed(3)}${push},format=yuv420p`,
      "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-r", "30", out]);
    shotFiles.push(out);
    console.log(`  ${shot.clip}: ${d.toFixed(2)} s from ${shot.from}s at ${speed.toFixed(2)}x${hold > 0.05 ? `, hold ${hold.toFixed(2)} s` : ""}${push ? ", push-in" : ""}`);
  }
  const sceneOut = path.join(TMP, `scene${s.n}.mp4`);
  if (shotFiles.length === 1) fs.copyFileSync(shotFiles[0], sceneOut);
  else {
    const list = path.join(TMP, `scene${s.n}.txt`);
    fs.writeFileSync(list, shotFiles.map((f) => `file '${f}'`).join("\n"));
    run(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", sceneOut]);
  }
  sceneFiles.push(sceneOut);
}

// 2. voice track: each scene's WAV starts 0.15 s into its scene and is padded to the scene length
const audioOut = path.join(TMP, "voice.wav");
if (!silent) {
  const inputs = plan.flatMap((s) => ["-i", path.join(VO, `scene${s.n}.wav`)]);
  const parts = plan.map((s, i) => `[${i}:a]aresample=48000,adelay=150:all=1,apad,atrim=duration=${s.dur.toFixed(3)}[a${i}]`);
  const graph = `${parts.join(";")};${plan.map((_, i) => `[a${i}]`).join("")}concat=n=${plan.length}:v=0:a=1,highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=11[out]`;
  run([...inputs, "-filter_complex", graph, "-map", "[out]", "-ar", "48000", audioOut]);
}

// 3. final: crossfade card -> first UI scene, hard cuts after that
const vin = sceneFiles.flatMap((f) => ["-i", f]);
const vgraph = `[0:v][1:v]xfade=transition=fade:duration=${XFADE}:offset=${plan[0].dur.toFixed(3)}[x];[x]${sceneFiles.slice(2).map((_, i) => `[${i + 2}:v]`).join("")}concat=n=${sceneFiles.length - 1}:v=1:a=0,format=yuv420p[v]`;
const out = path.join(CLIPS, "proposal_cut.mp4");
const audioArgs = silent ? [] : ["-i", audioOut];
const map = silent ? ["-map", "[v]"] : ["-map", "[v]", "-map", `${sceneFiles.length}:a`];
run([...vin, ...audioArgs, "-filter_complex", vgraph, ...map, "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-r", "30", "-pix_fmt", "yuv420p",
  ...(silent ? [] : ["-c:a", "aac", "-b:a", "192k"]), "-movflags", "+faststart", "-shortest", out]);
console.log(`wrote ${out} (${probe(out).toFixed(2)} s)`);
