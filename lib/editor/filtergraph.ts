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
import { logger } from "@/lib/logger";
import path from "path";
import type { TextClip, TimelineDoc, TransitionPreset } from "./types";
import {
  ASPECT_DIMENSIONS,
  EFFECT_PRESETS,
  FILTER_PRESETS,
  TRANSITION_DURATION_SEC,
  TRANSITION_PRESETS,
} from "./types";
import { docDuration, videoSegments } from "./doc-utils";

export interface ClipInput {
  /** local downloaded file path */
  filePath: string;
  /** whether the source file has an audio stream (probed at download time) */
  hasAudio: boolean;
  /** still image (drawn with -loop 1 instead of decoded as a video stream) */
  isImage?: boolean;
}

export interface FiltergraphInput {
  doc: TimelineDoc;
  /** assetId → downloaded local file info */
  assets: Map<string, ClipInput>;
  /** textClipId → path of a UTF-8 file containing the clip's text */
  textFiles: Map<string, string>;
  /** path to a generated ASS file covering the whole caption track (undefined/omitted when there are no captions) */
  captionAssPath?: string;
  /** Free-tier output treatment: cap the short edge at 720p and burn a
   * "Clipiro" corner watermark. Decided by the caller from the user's tier. */
  watermark?: boolean;
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

// Google Fonts bundled as static files (public/fonts) rather than relying on
// an OS install — same file on every platform, so all three candidate lists
// just point at the one bundled path.
const BUNDLED_FONTS: Record<string, string> = {
  Poppins: path.join(process.cwd(), "public/fonts/Poppins-Bold.ttf"),
  Montserrat: path.join(process.cwd(), "public/fonts/Montserrat.ttf"),
  "Bebas Neue": path.join(process.cwd(), "public/fonts/BebasNeue-Regular.ttf"),
  Oswald: path.join(process.cwd(), "public/fonts/Oswald.ttf"),
  "Playfair Display": path.join(process.cwd(), "public/fonts/PlayfairDisplay.ttf"),
  Anton: path.join(process.cwd(), "public/fonts/Anton-Regular.ttf"),
};
for (const [family, file] of Object.entries(BUNDLED_FONTS)) {
  FONT_FILES[family] = { win: file, linux: [file], mac: file };
}

export function resolveFontFile(family: string): string {
  const entry = FONT_FILES[family] ?? FONT_FILES.Arial;
  const candidates =
    process.platform === "win32" ? [entry.win] : process.platform === "darwin" ? [entry.mac] : entry.linux;
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  // A bundled Google Font (public/fonts/*.ttf) missing at its expected,
  // process.cwd()-relative path is exactly the failure mode that once took
  // ffmpeg binary resolution down in prod (see utils/ffmpeg-render.ts's
  // resolveFfmpegBin comment) — log loudly here too, before falling through
  // to a substitute font, so a wrong-looking render is traceable instead of
  // silently "close enough".
  logger.warn("editor-render", `font "${family}" not found at its expected path, falling back to Arial`, {
    triedCandidates: candidates,
    cwd: process.cwd(),
  });
  // Last-resort fallbacks across platforms
  const fallbacks = [
    FONT_FILES.Arial.win,
    ...FONT_FILES.Arial.linux,
    FONT_FILES.Arial.mac,
  ];
  for (const f of fallbacks) if (fs.existsSync(f)) return f;
  throw new Error(
    `No usable font file found for "${family}" (tried: ${[...candidates, ...fallbacks].join(", ")}; cwd: ${process.cwd()})`,
  );
}

/** Escape a path for use inside a filtergraph option value. */
export function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

const num = (n: number) => Number(n.toFixed(4));

/**
 * atempo only accepts 0.5–2.0 per instance; chain instances to reach any
 * speed in our 0.25–4 range (e.g. 4x = atempo=2,atempo=2).
 */
function atempoChain(speed: number): string {
  const parts: number[] = [];
  let s = speed;
  while (s > 2) {
    parts.push(2);
    s /= 2;
  }
  while (s < 0.5) {
    parts.push(0.5);
    s /= 0.5;
  }
  parts.push(s);
  return parts.map((p) => `atempo=${num(p)}`).join(",");
}

export function buildFilterGraph(input: FiltergraphInput): FiltergraphResult {
  const { doc, assets, textFiles, captionAssPath, outputPath } = input;
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
  const uniqueImageAssets = [...new Set(doc.tracks.image.map((c) => c.assetId))];
  for (const assetId of [...uniqueVideoAssets, ...uniqueAudioAssets, ...uniqueImageAssets]) {
    if (inputIndex.has(assetId)) continue;
    const asset = assets.get(assetId);
    if (!asset) throw new Error(`Missing downloaded asset ${assetId}`);
    // Stills need -loop 1 to behave as an (infinite) video stream; the
    // overlay's own enable window bounds how long it's actually visible.
    if (asset.isImage) args.push("-loop", "1", "-i", asset.filePath);
    else args.push("-i", asset.filePath);
    inputIndex.set(assetId, idx++);
  }

  // ── Video chain: segments (clips + black gaps) → concat/xfade ──
  const segments = videoSegments(doc);
  if (segments.length === 0) throw new Error("No video segments");
  const segLabels: { v: string; a: string; duration: number; transitionOut?: TransitionPreset }[] = [];

  // xfade requires all inputs to share timebase and pixel format; only pay
  // for the extra normalization when a transition is actually in play.
  const hasTransitions = segments.some(
    (seg, i) =>
      i < segments.length - 1 &&
      seg.kind === "clip" &&
      seg.clip.transitionOut &&
      TRANSITION_PRESETS[seg.clip.transitionOut].xfade !== null,
  );
  const xfadeNormalize = hasTransitions ? [`format=yuv420p`, `settb=AVTB`] : [];

  segments.forEach((seg, i) => {
    const vLabel = `v${i}`;
    const aLabel = `a${i}`;
    if (seg.kind === "gap") {
      filters.push(
        `color=c=black:s=${W}x${H}:r=30:d=${num(seg.duration)}${
          xfadeNormalize.length ? "," + xfadeNormalize.join(",") : ""
        }[${vLabel}]`,
      );
      filters.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${num(seg.duration)}[${aLabel}]`);
    } else {
      const clip = seg.clip;
      const n = inputIndex.get(clip.assetId)!;
      const asset = assets.get(clip.assetId)!;
      const speed = clip.speed ?? 1;
      // Timeline duration is fixed; speed changes how much SOURCE is consumed.
      const from = num(clip.srcIn);
      const to = num(clip.srcIn + clip.duration * speed);
      const fadeIn = Math.min(clip.fadeIn ?? 0, clip.duration);
      const fadeOut = Math.min(clip.fadeOut ?? 0, clip.duration);
      const preset = FILTER_PRESETS[clip.filter ?? "none"];
      const effect = EFFECT_PRESETS[clip.effect ?? "none"];

      const vChain = [
        `trim=start=${from}:end=${to}`,
        `setpts=PTS-STARTPTS`,
        ...(speed !== 1 ? [`setpts=PTS/${num(speed)}`] : []),
        `fps=30`,
        `scale=${W}:${H}:force_original_aspect_ratio=increase`,
        `crop=${W}:${H}`,
        `setsar=1`,
        ...(preset.ffmpeg ? [preset.ffmpeg] : []),
        ...(effect.ffmpeg ? [effect.ffmpeg(W, H)] : []),
        ...(fadeIn > 0 ? [`fade=t=in:st=0:d=${num(fadeIn)}`] : []),
        ...(fadeOut > 0 ? [`fade=t=out:st=${num(clip.duration - fadeOut)}:d=${num(fadeOut)}`] : []),
        ...xfadeNormalize,
      ];
      filters.push(`[${n}:v]${vChain.join(",")}[${vLabel}]`);

      if (asset.hasAudio && !clip.muted && clip.volume > 0) {
        const aChain = [
          `atrim=start=${from}:end=${to}`,
          `asetpts=PTS-STARTPTS`,
          ...(speed !== 1 ? [atempoChain(speed)] : []),
          `aformat=sample_rates=44100:channel_layouts=stereo`,
          `volume=${num(clip.volume)}`,
          ...(fadeIn > 0 ? [`afade=t=in:st=0:d=${num(fadeIn)}`] : []),
          ...(fadeOut > 0 ? [`afade=t=out:st=${num(clip.duration - fadeOut)}:d=${num(fadeOut)}`] : []),
        ];
        filters.push(`[${n}:a]${aChain.join(",")}[${aLabel}]`);
      } else {
        filters.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${num(clip.duration)}[${aLabel}]`);
      }
    }
    segLabels.push({
      v: `[${vLabel}]`,
      a: `[${aLabel}]`,
      duration: seg.kind === "clip" ? seg.clip.duration : seg.duration,
      transitionOut: seg.kind === "clip" ? seg.clip.transitionOut : undefined,
    });
  });

  let videoOut: string;
  let baseAudio: string;
  if (segLabels.length === 1) {
    videoOut = segLabels[0].v;
    baseAudio = segLabels[0].a;
  } else if (!hasTransitions) {
    const interleaved = segLabels.map((s) => `${s.v}${s.a}`).join("");
    filters.push(`${interleaved}concat=n=${segLabels.length}:v=1:a=1[vbase][abase]`);
    videoOut = "[vbase]";
    baseAudio = "[abase]";
  } else {
    // Transitions in play: audio stays one hard-cut concat (timings must not
    // shift), video is folded pairwise — xfade at boundaries with a
    // transition, plain concat otherwise. The outgoing side is first extended
    // with a freeze-frame (tpad) equal to the crossfade duration, so the
    // xfade overlap comes entirely from padding and the output duration is
    // exactly the sum of the segment durations — every downstream enable
    // window and the final -t stay valid.
    filters.push(`${segLabels.map((s) => s.a).join("")}concat=n=${segLabels.length}:v=0:a=1[abase]`);
    baseAudio = "[abase]";

    let acc = segLabels[0].v;
    let accDur = segLabels[0].duration;
    for (let i = 1; i < segLabels.length; i++) {
      const prev = segLabels[i - 1];
      const next = segLabels[i];
      const xfade = prev.transitionOut ? TRANSITION_PRESETS[prev.transitionOut].xfade : null;
      // xfade can't run longer than the incoming segment; skip degenerate cases.
      const dur = Math.min(TRANSITION_DURATION_SEC, next.duration);
      const out = `[vx${i}]`;
      if (xfade && dur >= 0.1) {
        const padded = `[vpad${i}]`;
        filters.push(`${acc}tpad=stop_mode=clone:stop_duration=${num(dur)}${padded}`);
        filters.push(
          `${padded}${next.v}xfade=transition=${xfade}:duration=${num(dur)}:offset=${num(accDur)}${out}`,
        );
      } else {
        filters.push(`${acc}${next.v}concat=n=2:v=1:a=0${out}`);
      }
      acc = out;
      accDur += next.duration;
    }
    videoOut = acc;
  }

  // ── Image/sticker overlays: chained `overlay` with enable windows ──
  // Renders below text so captions stay on top of any sticker/photo overlay.
  doc.tracks.image.forEach((im, i) => {
    const n = inputIndex.get(im.assetId)!;
    const fadeIn = Math.min(im.fadeIn ?? 0, im.duration);
    const fadeOut = Math.min(im.fadeOut ?? 0, im.duration);
    const targetW = Math.max(2, Math.round(im.scalePct * W));
    const procLabel = `[imgproc${i}]`;
    const procChain = [
      `scale=w=${targetW}:h=-2`,
      `format=rgba`,
      `colorchannelmixer=aa=${num(im.opacity)}`,
      ...(fadeIn > 0 ? [`fade=t=in:st=${num(im.timelineStart)}:d=${num(fadeIn)}:alpha=1`] : []),
      ...(fadeOut > 0 ? [`fade=t=out:st=${num(im.timelineStart + im.duration - fadeOut)}:d=${num(fadeOut)}:alpha=1`] : []),
    ];
    filters.push(`[${n}:v]${procChain.join(",")}${procLabel}`);

    const outLabel = `[vi${i}]`;
    const overlayArgs = [
      `x=(main_w*${num(im.x)})-(overlay_w/2)`,
      `y=(main_h*${num(im.y)})-(overlay_h/2)`,
      `enable='between(t,${num(im.timelineStart)},${num(im.timelineStart + im.duration)})'`,
    ];
    filters.push(`${videoOut}${procLabel}overlay=${overlayArgs.join(":")}${outLabel}`);
    videoOut = outLabel;
  });

  // ── Text overlays: chained drawtext with enable windows ──
  doc.tracks.text.forEach((t, i) => {
    if (t.hidden) return; // excluded from export, matching PreviewStage's activeTexts filter
    const textFile = textFiles.get(t.id);
    if (!textFile) throw new Error(`Missing textfile for text clip ${t.id}`);
    const font = resolveFontFile(t.fontFamily);
    const fontSize = Math.round(t.fontSizePct * H);
    const color = t.color;

    // normalized position → drawtext top-left x. "center" (default) keeps t.x
    // as the midpoint; "left"/"right" instead treat t.x as the anchor edge —
    // this is the one place preview and export intentionally diverge, since
    // the canvas always block-centers on t.x for drag-to-position ergonomics.
    const xExpr =
      t.align === "left" ? `(w*${num(t.x)})` :
      t.align === "right" ? `(w*${num(t.x)})-text_w` :
      `(w*${num(t.x)})-(text_w/2)`;

    const baseParts = [
      `textfile='${escapeFilterPath(textFile)}'`,
      `fontfile='${escapeFilterPath(font)}'`,
      `fontsize=${fontSize}`,
      `fontcolor=${color}`,
      `x=${xExpr}`,
      `y=(h*${num(t.y)})-(text_h/2)`,
      `enable='between(t,${num(t.timelineStart)},${num(t.timelineStart + t.duration)})'`,
    ];
    if (t.bgColor) baseParts.push(`box=1`, `boxcolor=${t.bgColor}@0.75`, `boxborderw=14`);
    if (t.strokeColor) {
      const strokeW = Math.max(1, Math.round((t.strokeWidthPct ?? 0.01) * H));
      baseParts.push(`borderw=${strokeW}`, `bordercolor=${t.strokeColor}`);
    }
    if (t.shadow) {
      baseParts.push(
        `shadowx=${Math.round(t.shadow.offsetXPct * W)}`,
        `shadowy=${Math.round(t.shadow.offsetYPct * H)}`,
        `shadowcolor=${t.shadow.color}@${num(t.shadow.opacity)}`,
      );
    }
    baseParts.push(`alpha=${num(t.opacity ?? 1)}`); // alpha=1 is drawtext's own default — a no-op for docs that never set opacity
    // Only emit line_spacing when the doc explicitly sets lineHeight — drawtext's
    // own default (no param) is what every pre-existing doc already rendered
    // with, so defaulting this to 1.2 here would silently reflow legacy exports.
    if (t.lineHeight !== undefined) {
      const lineSpacing = Math.round((t.lineHeight - 1) * fontSize);
      if (lineSpacing !== 0) baseParts.push(`line_spacing=${lineSpacing}`);
    }

    // Faux-bold: none of the 9 whitelisted fonts ship a bold .ttf, so "Bold"
    // instead redraws the same glyphs offset by ~1-2px — the overlapping
    // strokes read as heavier weight. Skipped when an explicit stroke is
    // already set (the stroke itself already thickens the glyph edges, and
    // stacking both looks smudged).
    if (t.bold && !t.strokeColor) {
      const offset = Math.max(1, Math.round(fontSize * 0.02));
      const offsetParts = baseParts.map((p) => (p.startsWith("x=") ? `x=${xExpr}+${offset}` : p));
      filters.push(`${videoOut}drawtext=${offsetParts.join(":")}[vtb${i}]`);
      videoOut = `[vtb${i}]`;
    }

    const outLabel = `[vt${i}]`;
    filters.push(`${videoOut}drawtext=${baseParts.join(":")}${outLabel}`);
    videoOut = outLabel;
  });

  // ── Captions: one `subtitles=` filter burns the WHOLE caption track,
  // regardless of cue count — the caption-ass.ts-generated ASS file already
  // encodes per-cue style/position/karaoke via inline override tags, so this
  // stays a single filter node instead of chaining one drawtext per cue.
  // Renders on top of text/image overlays (CapCut-standard subtitle layering).
  // fontsdir points libass at the same bundled TTF files drawtext resolves
  // via explicit file paths — without it, libass can only resolve fonts by
  // NAME through the OS font system, which won't know about our bundled
  // (not OS-installed) Google Fonts.
  if (captionAssPath) {
    const fontsDir = path.join(process.cwd(), "public/fonts");
    const outLabel = "[vcap]";
    filters.push(
      `${videoOut}subtitles=filename='${escapeFilterPath(captionAssPath)}':fontsdir='${escapeFilterPath(fontsDir)}'${outLabel}`,
    );
    videoOut = outLabel;
  }

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

  // ── Free-tier treatment: 720p cap + corner watermark (last video node, so
  // it applies over captions and overlays and can't be cropped away) ──
  if (input.watermark) {
    const wmFont = escapeFilterPath(resolveFontFile("Poppins"));
    const outLabel = "[vwm]";
    filters.push(
      `${videoOut}scale=w='if(gt(iw,ih),-2,min(720,iw))':h='if(gt(iw,ih),min(720,ih),-2)',` +
        `drawtext=fontfile='${wmFont}':text='Clipiro':fontsize=h/18:fontcolor=white@0.6:` +
        `borderw=2:bordercolor=black@0.35:x=w-tw-24:y=h-th-24${outLabel}`,
    );
    videoOut = outLabel;
  }

  const filterComplex = filters.join(";");

  args.push(
    "-filter_complex", filterComplex,
    "-map", videoOut,
    "-map", audioOut,
    // -threads 1 (SEV-1, P0-2): production's CPU advertises AVX-512 via
    // cpuid and x264 detects it, but x264's default multi-threaded slicing
    // then fails to open the encoder at all ("Error while opening encoder",
    // exit 187) — a known hypervisor/kernel class of bug around AVX-512
    // execution state across x264's thread context switches. Forcing
    // single-threaded encoding (ffmpeg's own -threads, read into x264's
    // thread count by libavcodec's wrapper) sidesteps it. Confirmed against
    // the real production host at this app's actual 1080x1920 export size —
    // see docs/editor-release-gate-stage1-production-verification.md's
    // P0-2 incident section. Mirrors the same fix already applied to the
    // AutoClip pipeline's encodeArgs() in utils/ffmpeg-render.ts, which this
    // file's own filtergraph does NOT route through.
    "-threads", "1",
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

function applyTextTransform(text: string, transform: TextClip["textTransform"]): string {
  switch (transform) {
    case "uppercase":
      return text.toUpperCase();
    case "lowercase":
      return text.toLowerCase();
    case "capitalize":
      return text.replace(/\b\w/g, (c) => c.toUpperCase());
    default:
      return text;
  }
}

/** Write each text clip's content to a UTF-8 textfile; returns id → path. */
export function writeTextFiles(doc: TimelineDoc, dir: string, prefix: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of doc.tracks.text) {
    const p = path.join(dir, `${prefix}-text-${t.id}.txt`);
    // drawtext renders the file contents literally; strip trailing newline noise
    const content = applyTextTransform(t.text.replace(/\r/g, ""), t.textTransform);
    fs.writeFileSync(p, content, "utf8");
    map.set(t.id, p);
  }
  return map;
}
