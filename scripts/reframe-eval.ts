// Score AutoClip's framing on real footage, the way production computes it.
//
//   npx tsx --env-file=.env scripts/reframe-eval.ts <video> [options]
//
//   --clips 13-31.6,41.2-67.4   clip windows in seconds (default: 30 s windows over the first 10 min)
//   --words words.json          diarized words [{start,end,speaker}] in ms, source time — enables speaker framing
//   --aspect 9:16               9:16 | 4:5 | 1:1 | 16:9
//   --sheet <dir>               also write a contact sheet per clip (crop window drawn on 6 frames)
//
// It runs the local face detector over the clip windows, assigns speakers,
// finds shot cuts, computes each clip's crop with production's shot-aware
// flags, and prints lib/reframe-metrics' score: the share of sampled moments
// where the main face (the talker when known) is inside what the renderer
// shows. Used to validate the reframing rebuild (2026-11-24) on the podcast
// demo, and meant for checking footage that a user reports as badly framed.
//
// Read-only: no database, no S3, no paid API.

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { detectFacesLocal } from "@/lib/face-detect-local";
import { assignSpeaking } from "@/lib/active-speaker";
import { computeClipCrop } from "@/lib/autoclip-pipeline";
import { detectScenes } from "@/lib/signal-track";
import { cropAt, scoreFraming } from "@/lib/reframe-metrics";
import { REFRAME_ASPECTS, type ReframeAspect } from "@/lib/reframe";
import { ffmpegBin, getMediaDimensions, getMediaDurationSec } from "@/utils/ffmpeg-render";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const video = process.argv[2];
  if (!video || video.startsWith("--") || !fs.existsSync(video)) {
    console.error("usage: tsx scripts/reframe-eval.ts <video> [--clips a-b,c-d] [--words words.json] [--aspect 9:16] [--sheet dir]");
    process.exit(2);
  }
  const aspect = (arg("aspect") ?? "9:16") as ReframeAspect;
  if (!REFRAME_ASPECTS.includes(aspect)) throw new Error(`unknown aspect ${aspect}`);
  const { w: srcW, h: srcH } = await getMediaDimensions(video);
  const duration = await getMediaDurationSec(video);
  const clips: [number, number][] = arg("clips")
    ? arg("clips")!.split(",").map((c) => c.split("-").map(Number) as [number, number])
    : Array.from({ length: Math.floor(Math.min(duration, 600) / 30) }, (_, i) => [i * 30, i * 30 + 30]);
  const words = arg("words") ? JSON.parse(fs.readFileSync(arg("words")!, "utf8")) : null;

  const t0 = Date.now();
  const detected = await detectFacesLocal(video, clips.map(([start, end]) => ({ start, end })), duration, srcW, srcH);
  if (detected.failure) throw new Error(`face detection failed: ${detected.failure}`);
  const faces = assignSpeaking(detected.boxes, words);
  console.log(`${srcW}x${srcH}, ${clips.length} clips, ${faces.length} face samples in ${((Date.now() - t0) / 1000).toFixed(0)}s${words ? ", speakers from transcript" : ""}\n`);

  let moments = 0, visible = 0, nobody = 0;
  const sheet = arg("sheet");
  if (sheet) fs.mkdirSync(sheet, { recursive: true });
  for (const [start, end] of clips) {
    const shots = await detectScenes(video, start, end);
    const ai = { features: { shotAwareReframe: true, cameraPath: true, speakerLead: true }, shots, scenes: null, tracks: null, planLayout: null };
    const crop = computeClipCrop(faces, { start, end } as never, aspect, srcW, srcH, { speakerMode: "auto", smartAutoReframe: true }, ai as never);
    const rel = faces.filter((f) => f.tSec >= start && f.tSec <= end).map((f) => ({ ...f, tSec: f.tSec - start }));
    const s = scoreFraming(crop, rel, aspect, srcW, srcH);
    moments += s.moments; visible += s.mainVisible; nobody += s.nobodyVisible;
    console.log(`${start.toFixed(1).padStart(7)}-${end.toFixed(1).padEnd(7)} ${String(crop?.mode ?? "centre").padEnd(7)} shots=${shots.length + 1}  main face in frame ${s.mainVisible}/${s.moments}  nobody in frame ${s.nobodyVisible}`);
    if (sheet && ffmpegBin) {
      const tiles: string[] = [];
      for (let i = 0; i < 6; i++) {
        const t = 0.2 + (i * (end - start - 0.4)) / 5;
        let vf = "scale=480:-2";
        if (crop?.mode === "single") {
          const win = cropAt(crop.keyframes, t)!;
          vf += `,drawbox=x=${Math.round(win.x * 480)}:y=${Math.round(win.y * 270)}:w=${Math.round(win.w * 480)}:h=${Math.round(win.h * 270)}:color=lime@0.9:t=5`;
        }
        const out = path.join(sheet, `${start}-${i}.png`);
        spawnSync(ffmpegBin, ["-v", "error", "-y", "-ss", String(start + t), "-i", video, "-frames:v", "1", "-vf", vf, out]);
        tiles.push(out);
      }
      spawnSync(ffmpegBin, ["-v", "error", "-y", ...tiles.flatMap((f) => ["-i", f]), "-filter_complex", `hstack=inputs=${tiles.length}`, path.join(sheet, `clip-${start}.png`)]);
      tiles.forEach((f) => fs.rmSync(f, { force: true }));
    }
  }
  console.log(`\nTOTAL main face in frame ${visible}/${moments} (${moments ? ((100 * visible) / moments).toFixed(1) : "100"}%), moments with nobody in frame: ${nobody}`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
