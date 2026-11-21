// Stage 4 — Gemini watches each clip and labels every shot.
//
// The reframe rules (lib/scene-layout.ts classifyScene) decide the layout from
// face boxes alone, which is all they have: a screen recording, gameplay with
// a webcam, or a product demo look like "no face" or "one small face", and
// get framed by accident. A model that actually sees the frame can say what
// the shot IS and where its subject is.
//
// Cost is kept bounded by only ever sending the chosen clips (never the whole
// source), as a small 1 fps, 360p proxy with no audio.

import fs from "fs";
import os from "os";
import path from "path";
import { z } from "zod";
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { runFFmpegArgs, ffmpegInputArgs } from "@/utils/ffmpeg-render";
import { geminiJson } from "@/lib/autoclip-ai/gemini";
import type { AutoClipAiConfig } from "@/lib/autoclip-ai/config";
import type { AiBudget } from "@/lib/autoclip-ai/budget";
import type { NormBox, SceneShot, SceneShotType } from "@/lib/autoclip-ai/types";

const SHOT_TYPES = ["single", "dialogue", "group", "screen", "gameplay_facecam", "product", "broll_like"] as const;

/** Gemini's native box format: [ymin, xmin, ymax, xmax], 0-1000. */
const box2d = z.array(z.number().min(0).max(1000)).length(4);

const visionSchema = z.object({
  shots: z.array(z.object({
    index: z.number().int().min(0),
    type: z.enum(SHOT_TYPES),
    confidence: z.number().min(0).max(100),
    subject_box: box2d.optional().nullable(),
    facecam_box: box2d.optional().nullable(),
    screen_box: box2d.optional().nullable(),
  })).max(60),
});

/** [ymin,xmin,ymax,xmax] 0-1000 → frame fractions; null for a degenerate box. */
export function fromBox2d(b: number[] | null | undefined): NormBox | undefined {
  if (!b || b.length !== 4) return undefined;
  const [y0, x0, y1, x1] = b.map((v) => v / 1000);
  const x = Math.min(x0, x1), y = Math.min(y0, y1);
  const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
  if (w < 0.02 || h < 0.02) return undefined;
  const r = (v: number) => Math.round(v * 10_000) / 10_000;
  return { x: r(x), y: r(y), w: r(w), h: r(h) };
}

/** Shot ranges from boundary times. Shots under `minSec` merge into the one before. */
export function shotRanges(boundaries: number[], durationSec: number, minSec = 1): { startSec: number; endSec: number }[] {
  if (durationSec <= 0) return [];
  const cuts = [...new Set(boundaries.filter((t) => t > 0 && t < durationSec))].sort((a, b) => a - b);
  const pts = [0, ...cuts, durationSec];
  const ranges: { startSec: number; endSec: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const s = pts[i], e = pts[i + 1];
    if (ranges.length > 0 && e - s < minSec) ranges[ranges.length - 1].endSec = e;
    else ranges.push({ startSec: s, endSec: e });
  }
  // A too-short FIRST shot has nothing before it to merge into: fold it forward.
  if (ranges.length > 1 && ranges[0].endSec - ranges[0].startSec < minSec) {
    ranges[1].startSec = 0;
    ranges.shift();
  }
  return ranges;
}

export function buildSceneVisionPrompt(shots: { startSec: number; endSec: number }[]): string {
  return `This is a ${shots.length}-shot excerpt of a video that will be reframed for a vertical (9:16) phone screen.
The shots are:
${shots.map((s, i) => `  ${i}: ${s.startSec.toFixed(1)}s-${s.endSec.toFixed(1)}s`).join("\n")}

For EACH shot, say what it is and where its subject is. Types:
- "single": one person talking. - "dialogue": two people in conversation. - "group": three or more people.
- "screen": a screen recording, slides or a UI is the main content (give "screen_box": the screen area).
- "gameplay_facecam": video game footage with a small webcam overlay (give "facecam_box": the webcam).
- "product": an object or demonstration is the focus, not a face (give "subject_box").
- "broll_like": scenery or footage with no clear subject.
Boxes are [ymin, xmin, ymax, xmax] on a 0-1000 scale, as seen at the START of the shot.
"confidence" is 0-100.

Return JSON {"shots":[{"index":0,"type":"...","confidence":85,"subject_box":[...]}]}.`;
}

async function makeProxy(videoPath: string, startSec: number, endSec: number, out: string): Promise<void> {
  await runFFmpegArgs([
    "-y", "-ss", String(startSec), "-to", String(endSec), ...ffmpegInputArgs(videoPath),
    "-an", "-vf", "fps=1,scale=-2:360", "-c:v", "libx264", "-preset", "veryfast", "-crf", "32", "-movflags", "+faststart", out,
  ], 180_000);
}

async function waitActive(fm: GoogleAIFileManager, name: string, deadlineMs = 90_000): Promise<boolean> {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    const f = await fm.getFile(name);
    if (f.state === FileState.ACTIVE) return true;
    if (f.state === FileState.FAILED) return false;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

/**
 * Label every shot of one clip. `shotBoundaries` are clip-relative seconds
 * (the signal track's scene cuts). Null when the step is skipped or fails.
 */
export async function analyzeClipScenes(args: {
  videoPath: string;
  clipStartSec: number;
  clipEndSec: number;
  shotBoundaries: number[];
  clip: number;
  cfg: AutoClipAiConfig;
  budget: AiBudget;
}): Promise<SceneShot[] | null> {
  if (!env.GEMINI_API_KEY) return null;
  const duration = args.clipEndSec - args.clipStartSec;
  if (duration <= 0) return null;
  const shots = shotRanges(args.shotBoundaries, duration).slice(0, 40);
  if (!args.budget.tryReserve("scene_vision", args.cfg.unitCostUsd.geminiVideoPerMin * Math.max(0.25, duration / 60), args.clip)) return null;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "scene-vision-"));
  const fm = new GoogleAIFileManager(env.GEMINI_API_KEY);
  let fileName: string | null = null;
  try {
    const proxy = path.join(tmp, "proxy.mp4");
    await makeProxy(args.videoPath, args.clipStartSec, args.clipEndSec, proxy);
    const up = await fm.uploadFile(proxy, { mimeType: "video/mp4", displayName: `clip-${args.clip}` });
    fileName = up.file.name;
    if (!(await waitActive(fm, up.file.name))) return null;
    const answer = await geminiJson({
      label: "scene-vision",
      parts: [{ fileData: { mimeType: "video/mp4", fileUri: up.file.uri } }, buildSceneVisionPrompt(shots)],
      schema: visionSchema,
      timeoutMs: 60_000,
      temperature: 0.1,
    });
    if (!answer) return null;
    const byIndex = new Map(answer.shots.map((s) => [s.index, s]));
    return shots.flatMap((range, i) => {
      const s = byIndex.get(i);
      if (!s) return [];
      const out: SceneShot = { ...range, type: s.type as SceneShotType, confidence: s.confidence };
      const subject = fromBox2d(s.subject_box), cam = fromBox2d(s.facecam_box), screen = fromBox2d(s.screen_box);
      if (subject) out.subjectBox = subject;
      if (cam) out.facecamBox = cam;
      if (screen) out.screenBox = screen;
      return [out];
    });
  } catch (err) {
    logger.warn("autoclip-ai", `scene vision failed for clip ${args.clip}`, err);
    return null;
  } finally {
    if (fileName) await fm.deleteFile(fileName).catch(() => {});
    fs.rmSync(/*turbopackIgnore: true*/ tmp, { recursive: true, force: true });
  }
}
