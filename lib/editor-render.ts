// Builds the ffmpeg argument list for an EditorDoc. Kept pure (no I/O) so it is
// easy to reason about and test. The render route is responsible for downloading
// inputs, generating the ASS file, NORMALIZING overlay/caption times to be
// output-relative (offset by trimStart, clipped to the trim window), then calling
// this with local file paths.
//
// Convention: doc.trimStart / doc.trimEnd are REAL source-video seconds (used for
// the input seek). All textOverlays / imageOverlays times passed here are
// OUTPUT-relative seconds (0 = first frame of the trimmed output).

import type { EditorDoc } from "./editor-types";
import { cropScaleFilter, outputResolution } from "./crop";

export interface EditorRenderPaths {
  video: string;
  ass?: string;            // present only when captions are burned
  music?: string;
  images: string[];        // aligned 1:1 with doc.imageOverlays
  output: string;
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\n/g, " ");
}

function escapeAssPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

export function buildEditorFFmpegArgs(doc: EditorDoc, paths: EditorRenderPaths): string[] {
  const res = outputResolution(doc.aspect);
  const outW = res?.w ?? 1080;
  const outH = res?.h ?? 1920;

  const trimDur = Math.max(0.1, doc.trimEnd - doc.trimStart);

  // ── Inputs ───────────────────────────────────────────────────────────────
  const args: string[] = ["-y", "-ss", String(doc.trimStart), "-t", String(trimDur), "-i", paths.video];

  const imageInputIdx: number[] = [];
  doc.imageOverlays.forEach((_, i) => {
    imageInputIdx[i] = args.filter(a => a === "-i").length; // next input index
    args.push("-i", paths.images[i]);
  });

  let musicIdx = -1;
  if (doc.music && paths.music) {
    musicIdx = args.filter(a => a === "-i").length;
    args.push("-i", paths.music);
  }

  // ── Video filter chain ─────────────────────────────────────────────────────
  const filters: string[] = [];
  let vlabel = "v0";
  filters.push(`[0:v]${cropScaleFilter(doc.aspect)}[${vlabel}]`);

  if (doc.captions.enabled && paths.ass && doc.captions.segments.length > 0) {
    const next = "vsub";
    filters.push(`[${vlabel}]subtitles='${escapeAssPath(paths.ass)}'[${next}]`);
    vlabel = next;
  }

  // Text overlays via drawtext (mirrors the streamer-video approach: no fontfile,
  // relies on ffmpeg's default font; borderw for legibility).
  doc.textOverlays.forEach((t, i) => {
    const fs = Math.round(t.fontSize * (outW / 1080));
    const x = Math.round(t.x * outW);
    const y = Math.round(t.y * outH);
    const next = `vt${i}`;
    filters.push(
      `[${vlabel}]drawtext=text='${escapeDrawtext(t.text)}':fontsize=${fs}:fontcolor=${t.color}:` +
      `x=${x}:y=${y}:borderw=3:bordercolor=black:shadowx=2:shadowy=2:shadowcolor=black@0.6:` +
      `enable='between(t,${t.start.toFixed(2)},${t.end.toFixed(2)})'[${next}]`
    );
    vlabel = next;
  });

  // Image overlays.
  doc.imageOverlays.forEach((img, i) => {
    const ow = Math.round(img.w * outW);
    const x = Math.round(img.x * outW);
    const y = Math.round(img.y * outH);
    const scaled = `img${i}`;
    const next = `vi${i}`;
    filters.push(`[${imageInputIdx[i]}:v]scale=${ow}:-1[${scaled}]`);
    filters.push(
      `[${vlabel}][${scaled}]overlay=${x}:${y}:` +
      `enable='between(t,${img.start.toFixed(2)},${img.end.toFixed(2)})'[${next}]`
    );
    vlabel = next;
  });

  // ── Audio chain ─────────────────────────────────────────────────────────────
  let mapAudio: string;
  if (musicIdx >= 0 && doc.music) {
    filters.push(`[${musicIdx}:a]volume=${doc.music.volume.toFixed(2)}[mvol]`);
    filters.push(`[0:a][mvol]amix=inputs=2:duration=first:dropout_transition=0[aout]`);
    mapAudio = "[aout]";
  } else {
    mapAudio = "0:a?"; // optional — source may have no audio track
  }

  args.push("-filter_complex", filters.join(";"));
  args.push("-map", `[${vlabel}]`);
  args.push("-map", mapAudio);
  args.push(
    "-c:v", "libx264", "-preset", "superfast", "-crf", "23",
    "-c:a", "aac", "-shortest",
    paths.output,
  );
  return args;
}
