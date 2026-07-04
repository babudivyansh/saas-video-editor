// Pure TimelineDoc → ffmpeg argument builder. No I/O here except reading the
// font map — callers pass local file paths for every asset and pre-written
// drawtext textfiles, so this stays unit-testable without running ffmpeg.
//
// Pipeline shape:
//   video: per-clip trim → fps/scale-cover-crop/setsar normalize → black gap
//          fillers → concat → chained drawtext overlays (enable windows)
//   audio: per-clip atrim/volume (anullsrc for silent sources & gaps) →
//          concat → amix with adelay'ed music track
//
// Known repo gotchas respected: explicit fontfile (Windows needs it), no
// vstack, textfile= instead of inline text escaping.

import fs from "fs";
import path from "path";
import type { TimelineDoc } from "./types";
import { ASPECT_DIMENSIONS } from "./types";
import { docDuration, videoSegments } from "./doc-utils";

export interface ClipInput {
  /** local downloaded file path */
  filePath: string;
  /** whether the source file has an audio stream (probed at download time) */
  hasAudio: boolean;
}

export interface FiltergraphInput {
  doc: TimelineDoc;
  /** assetId → downloaded local file info */
  assets: Map<string, ClipInput>;
  /** textClipId → path of a UTF-8 file containing the clip's text */
  textFiles: Map<string, string>;
  outputPath: string;
}

export interface FiltergraphResult {
  args: string[];
  /** the full -filter_complex expression (also written by caller if too long) */
  filterComplex: string;
  durationSec: number;
}

// Platform font map for drawtext. fontfile is REQUIRED on Windows — without
// it drawtext fails to locate fonts (confirmed failure mode in this repo).
const FONT_FILES: Record<string, { win: string; linux: string[]; mac: string }> = {
  Arial: {
    win: "C:/Windows/Fonts/arial.ttf",
    linux: ["/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"],
    mac: "/Library/Fonts/Arial.ttf",
  },
  Impact: {
    win: "C:/Windows/Fonts/impact.ttf",
    linux: ["/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
    mac: "/Library/Fonts/Impact.ttf",
  },
  "Times New Roman": {
    win: "C:/Windows/Fonts/times.ttf",
    linux: ["/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"],
    mac: "/Library/Fonts/Times New Roman.ttf",
  },
};

export function resolveFontFile(family: string): string {
  const entry = FONT_FILES[family] ?? FONT_FILES.Arial;
  const candidates =
    process.platform === "win32" ? [entry.win] : process.platform === "darwin" ? [entry.mac] : entry.linux;
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  // Last-resort fallbacks across platforms
  const fallbacks = [
    FONT_FILES.Arial.win,
    ...FONT_FILES.Arial.linux,
    FONT_FILES.Arial.mac,
  ];
  for (const f of fallbacks) if (fs.existsSync(f)) return f;
  throw new Error(`No usable font file found for "${family}"`);
}

/** Escape a path for use inside a filtergraph option value. */
function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

const num = (n: number) => Number(n.toFixed(4));

export function buildFilterGraph(input: FiltergraphInput): FiltergraphResult {
  const { doc, assets, textFiles, outputPath } = input;
  const { w: W, h: H } = ASPECT_DIMENSIONS[doc.aspect];
  const total = docDuration(doc);
  if (total <= 0) throw new Error("Timeline is empty");

  const args: string[] = ["-y"];
  const filters: string[] = [];

  // ── Inputs: one per unique video/audio asset used ──
  const inputIndex = new Map<string, number>(); // assetId → ffmpeg input index
  let idx = 0;
  const uniqueVideoAssets = [...new Set(doc.tracks.video.map((c) => c.assetId))];
  const uniqueAudioAssets = [...new Set(doc.tracks.audio.map((c) => c.assetId))];
  for (const assetId of [...uniqueVideoAssets, ...uniqueAudioAssets]) {
    if (inputIndex.has(assetId)) continue;
    const asset = assets.get(assetId);
    if (!asset) throw new Error(`Missing downloaded asset ${assetId}`);
    args.push("-i", asset.filePath);
    inputIndex.set(assetId, idx++);
  }

  // ── Video chain: segments (clips + black gaps) → concat ──
  const segments = videoSegments(doc);
  if (segments.length === 0) throw new Error("No video segments");
  const segLabels: { v: string; a: string }[] = [];

  segments.forEach((seg, i) => {
    const vLabel = `v${i}`;
    const aLabel = `a${i}`;
    if (seg.kind === "gap") {
      filters.push(`color=c=black:s=${W}x${H}:r=30:d=${num(seg.duration)}[${vLabel}]`);
      filters.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${num(seg.duration)}[${aLabel}]`);
    } else {
      const clip = seg.clip;
      const n = inputIndex.get(clip.assetId)!;
      const asset = assets.get(clip.assetId)!;
      const from = num(clip.srcIn);
      const to = num(clip.srcIn + clip.duration);
      filters.push(
        `[${n}:v]trim=start=${from}:end=${to},setpts=PTS-STARTPTS,fps=30,` +
          `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[${vLabel}]`,
      );
      if (asset.hasAudio && !clip.muted && clip.volume > 0) {
        filters.push(
          `[${n}:a]atrim=start=${from}:end=${to},asetpts=PTS-STARTPTS,` +
            `aformat=sample_rates=44100:channel_layouts=stereo,volume=${num(clip.volume)}[${aLabel}]`,
        );
      } else {
        filters.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${num(clip.duration)}[${aLabel}]`);
      }
    }
    segLabels.push({ v: `[${vLabel}]`, a: `[${aLabel}]` });
  });

  let videoOut: string;
  let baseAudio: string;
  if (segLabels.length === 1) {
    videoOut = segLabels[0].v;
    baseAudio = segLabels[0].a;
  } else {
    const interleaved = segLabels.map((s) => `${s.v}${s.a}`).join("");
    filters.push(`${interleaved}concat=n=${segLabels.length}:v=1:a=1[vbase][abase]`);
    videoOut = "[vbase]";
    baseAudio = "[abase]";
  }

  // ── Text overlays: chained drawtext with enable windows ──
  doc.tracks.text.forEach((t, i) => {
    const textFile = textFiles.get(t.id);
    if (!textFile) throw new Error(`Missing textfile for text clip ${t.id}`);
    const font = resolveFontFile(t.fontFamily + (t.bold && t.fontFamily === "Impact" ? "" : ""));
    const fontSize = Math.round(t.fontSizePct * H);
    const color = t.color;
    const outLabel = `[vt${i}]`;
    const parts = [
      `textfile='${escapeFilterPath(textFile)}'`,
      `fontfile='${escapeFilterPath(font)}'`,
      `fontsize=${fontSize}`,
      `fontcolor=${color}`,
      // normalized center position → drawtext top-left coordinates
      `x=(w*${num(t.x)})-(text_w/2)`,
      `y=(h*${num(t.y)})-(text_h/2)`,
      `enable='between(t,${num(t.timelineStart)},${num(t.timelineStart + t.duration)})'`,
    ];
    if (t.bgColor) parts.push(`box=1`, `boxcolor=${t.bgColor}@0.75`, `boxborderw=14`);
    if (t.bold) parts.push(`borderw=1`, `bordercolor=${color}`); // faux-bold stroke for fonts without bold file
    filters.push(`${videoOut}drawtext=${parts.join(":")}${outLabel}`);
    videoOut = outLabel;
  });

  // ── Music/audio track: adelay + amix over the base audio ──
  let audioOut = baseAudio;
  if (doc.tracks.audio.length > 0) {
    const musicLabels: string[] = [];
    doc.tracks.audio.forEach((m, i) => {
      const n = inputIndex.get(m.assetId)!;
      const from = num(m.srcIn);
      const to = num(m.srcIn + m.duration);
      const delayMs = Math.round(m.timelineStart * 1000);
      filters.push(
        `[${n}:a]atrim=start=${from}:end=${to},asetpts=PTS-STARTPTS,` +
          `aformat=sample_rates=44100:channel_layouts=stereo,volume=${num(m.volume)},` +
          `adelay=${delayMs}|${delayMs}[m${i}]`,
      );
      musicLabels.push(`[m${i}]`);
    });
    filters.push(
      `${baseAudio}${musicLabels.join("")}amix=inputs=${1 + musicLabels.length}:duration=first:normalize=0[aout]`,
    );
    audioOut = "[aout]";
  }

  const filterComplex = filters.join(";");

  args.push(
    "-filter_complex", filterComplex,
    "-map", videoOut,
    "-map", audioOut,
    "-c:v", "libx264",
    "-preset", "superfast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-t", String(num(total)),
    "-movflags", "+faststart",
    outputPath,
  );

  return { args, filterComplex, durationSec: total };
}

/**
 * If the filtergraph is very long, write it to a script file and swap
 * -filter_complex for -filter_complex_script (Windows ~8k arg-length limit).
 */
export function maybeUseFilterScript(result: FiltergraphResult, scriptPath: string): string[] {
  if (result.filterComplex.length < 6000) return result.args;
  fs.writeFileSync(scriptPath, result.filterComplex, "utf8");
  const args = [...result.args];
  const i = args.indexOf("-filter_complex");
  args.splice(i, 2, "-filter_complex_script", scriptPath);
  return args;
}

/** Write each text clip's content to a UTF-8 textfile; returns id → path. */
export function writeTextFiles(doc: TimelineDoc, dir: string, prefix: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of doc.tracks.text) {
    const p = path.join(dir, `${prefix}-text-${t.id}.txt`);
    // drawtext renders the file contents literally; strip trailing newline noise
    fs.writeFileSync(p, t.text.replace(/\r/g, ""), "utf8");
    map.set(t.id, p);
  }
  return map;
}
