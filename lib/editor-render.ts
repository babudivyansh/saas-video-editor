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
import type { TrackDoc, VideoClipData, AudioClipData, TextClipData, EffectId } from "./track-editor-types";
import { ASPECT_DIMENSIONS, computeDuration } from "./track-editor-types";

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

// ── TrackDoc (v2) render ──────────────────────────────────────────────────────

export interface TrackRenderPaths {
  videoPaths: Map<string, string>; // clipId → local path
  audioPaths: Map<string, string>; // clipId → local path
  output: string;
}

function effectToFilter(eff: EffectId, W: number, H: number): string | null {
  switch (eff) {
    case "cinematic":
      return "colorchannelmixer=rr=1.0:rg=0.02:rb=0.02:gr=0.02:gg=0.92:gb=0.02:br=0.02:bg=0.02:bb=0.9,curves=r='0/0 0.5/0.47 1/1':g='0/0 0.5/0.5 1/0.96':b='0/0.02 0.5/0.5 1/0.98'";
    case "vhs":
      return "noise=alls=8:allf=t+u,hue=s=0.55,eq=contrast=1.08:brightness=-0.04";
    case "glitch":
      return "noise=alls=12:allf=t,hue=h=3:s=1.2";
    case "film-grain":
      return "noise=alls=6:allf=t";
    case "retro":
      return "hue=s=0.65,eq=contrast=1.15:brightness=-0.04,curves=r='0/0 0.5/0.47 1/1':b='0/0 0.5/0.5 1/0.87'";
    case "neon":
      return "hue=s=2.2,eq=contrast=1.4:brightness=0.04";
    case "blur":
      return "gblur=sigma=5";
    case "rgb-split":
      return "noise=alls=4:allf=u,hue=h=2";
    case "viral-zoom":
    case "punch-in":
      return `scale=${Math.round(W * 1.18)}:${Math.round(H * 1.18)},crop=${W}:${H}`;
    case "zoom":
      return `scale=${Math.round(W * 1.08)}:${Math.round(H * 1.08)},crop=${W}:${H}`;
    case "shake":
      return `crop=${W - 8}:${H - 8}:4:4,scale=${W}:${H}`;
    case "pan":
      return `scale=${Math.round(W * 1.05)}:${Math.round(H * 1.05)},crop=${W}:${H}`;
    default:
      return null;
  }
}

function buildAtempo(speed: number): string {
  // atempo filter accepts only 0.5–2.0; chain for extremes
  if (speed >= 0.5 && speed <= 2.0) return `atempo=${speed.toFixed(4)}`;
  if (speed < 0.5) return `atempo=0.5,atempo=${(speed / 0.5).toFixed(4)}`;
  return `atempo=2.0,atempo=${(speed / 2.0).toFixed(4)}`;
}

export function buildTrackDocFFmpegArgs(doc: TrackDoc, paths: TrackRenderPaths): string[] {
  const { w: W, h: H } = ASPECT_DIMENSIONS[doc.aspect];
  const fps = doc.fps;
  const totalDuration = computeDuration(doc);

  const args: string[] = ["-y"];
  const filterParts: string[] = [];

  const videoTracks = doc.tracks.filter(t => t.kind === "video" && !t.hidden);
  const audioTracks = doc.tracks.filter(t => t.kind === "audio" && !t.hidden && !t.muted);
  const textTracks  = doc.tracks.filter(t => t.kind === "text"  && !t.hidden);

  const mainTrack = videoTracks[0];
  if (!mainTrack || mainTrack.clips.length === 0) {
    throw new Error("TrackDoc has no video clips to render");
  }

  const sortedClips = [...mainTrack.clips]
    .filter(c => c.data.kind === "video")
    .sort((a, b) => a.start - b.start);

  // ── Register inputs ───────────────────────────────────────────────────────
  const clipInputIndex = new Map<string, number>();
  let inputCount = 0;

  for (const clip of sortedClips) {
    const localPath = paths.videoPaths.get(clip.id);
    if (!localPath) continue;
    const d = clip.data as VideoClipData;
    const srcDur = clip.srcOut - clip.srcIn;
    args.push("-ss", clip.srcIn.toFixed(3), "-t", srcDur.toFixed(3), "-i", localPath);
    clipInputIndex.set(clip.id, inputCount++);
  }

  const audioInputIndex = new Map<string, number>();
  for (const track of audioTracks) {
    for (const clip of track.clips) {
      if (clip.data.kind !== "audio") continue;
      const localPath = paths.audioPaths.get(clip.id);
      if (!localPath) continue;
      const srcDur = clip.srcOut - clip.srcIn;
      args.push("-ss", clip.srcIn.toFixed(3), "-t", srcDur.toFixed(3), "-i", localPath);
      audioInputIndex.set(clip.id, inputCount++);
    }
  }

  // ── Video filter chain ─────────────────────────────────────────────────────
  const segments: string[] = [];
  let currentTime = 0;
  let segIdx = 0;

  for (const clip of sortedClips) {
    const inIdx = clipInputIndex.get(clip.id);

    // Black gap before this clip
    if (clip.start > currentTime + 0.02) {
      const gapDur = clip.start - currentTime;
      const gLabel = `gap${segIdx}`;
      filterParts.push(`color=s=${W}x${H}:c=black:r=${fps}:d=${gapDur.toFixed(3)}[${gLabel}]`);
      segments.push(`[${gLabel}]`);
      segIdx++;
    }

    if (inIdx === undefined) {
      // Source file missing — black placeholder for clip duration
      const bLabel = `miss${segIdx}`;
      filterParts.push(`color=s=${W}x${H}:c=black:r=${fps}:d=${clip.duration.toFixed(3)}[${bLabel}]`);
      segments.push(`[${bLabel}]`);
    } else {
      const d = clip.data as VideoClipData;
      const parts: string[] = [
        `scale=${W}:${H}:force_original_aspect_ratio=increase`,
        `crop=${W}:${H}`,
        `fps=${fps}`,
      ];

      if (d.speed !== 1) parts.push(`setpts=PTS/${d.speed.toFixed(4)}`);

      if (d.brightness !== 1 || d.contrast !== 1 || d.saturation !== 1) {
        parts.push(`eq=brightness=${(d.brightness - 1).toFixed(3)}:contrast=${d.contrast.toFixed(3)}:saturation=${d.saturation.toFixed(3)}`);
      }

      if (d.blur > 0) parts.push(`gblur=sigma=${Math.round(d.blur)}`);

      for (const eff of d.effects) {
        const f = effectToFilter(eff, W, H);
        if (f) parts.push(f);
      }

      const sLabel = `vs${segIdx}`;
      filterParts.push(`[${inIdx}:v]${parts.join(",")}[${sLabel}]`);
      segments.push(`[${sLabel}]`);
    }

    currentTime = clip.start + clip.duration;
    segIdx++;
  }

  // Tail padding
  if (currentTime < totalDuration - 0.02) {
    const gLabel = `gapend`;
    filterParts.push(`color=s=${W}x${H}:c=black:r=${fps}:d=${(totalDuration - currentTime).toFixed(3)}[${gLabel}]`);
    segments.push(`[${gLabel}]`);
  }

  // Concat all segments
  let vMain: string;
  if (segments.length === 0) {
    filterParts.push(`color=s=${W}x${H}:c=black:r=${fps}:d=${totalDuration.toFixed(3)}[vblack]`);
    vMain = "vblack";
  } else if (segments.length === 1) {
    vMain = "vmain";
    filterParts.push(`${segments[0]}copy[${vMain}]`);
  } else {
    vMain = "vmain";
    filterParts.push(`${segments.join("")}concat=n=${segments.length}:v=1:a=0[${vMain}]`);
  }

  // ── Text overlays (drawtext) ──────────────────────────────────────────────
  let vCurrent = vMain;
  let tIdx = 0;

  for (const track of textTracks) {
    for (const clip of track.clips) {
      if (clip.data.kind !== "text") continue;
      const d = clip.data as TextClipData;
      const txt = d.uppercase ? d.text.toUpperCase() : d.text;
      const fs = Math.round(d.fontSize * W / 1080);
      const tEnd = clip.start + clip.duration;
      const nextLabel = `vt${tIdx}`;

      let dt = `drawtext=text='${escapeDrawtext(txt)}'`;
      dt += `:fontsize=${fs}`;
      dt += `:fontcolor=${d.color}`;
      dt += `:x=${d.posX.toFixed(4)}*w-text_w/2`;
      dt += `:y=${d.posY.toFixed(4)}*h-text_h/2`;

      if (d.stroke) {
        dt += `:borderw=${Math.round(d.strokeWidth * W / 1080)}:bordercolor=${d.strokeColor}`;
      } else {
        dt += `:borderw=3:bordercolor=black@0.7`;
      }

      if (d.shadow) dt += `:shadowx=2:shadowy=2:shadowcolor=${d.shadowColor}@0.6`;
      dt += `:enable='between(t,${clip.start.toFixed(3)},${tEnd.toFixed(3)})'`;

      filterParts.push(`[${vCurrent}]${dt}[${nextLabel}]`);
      vCurrent = nextLabel;
      tIdx++;
    }
  }

  // ── Audio chain ───────────────────────────────────────────────────────────
  const audioStreams: string[] = [];

  for (const track of audioTracks) {
    for (const clip of track.clips) {
      if (clip.data.kind !== "audio") continue;
      const inIdx = audioInputIndex.get(clip.id);
      if (inIdx === undefined) continue;
      const d = clip.data as AudioClipData;
      if (d.muted) continue;

      const delayMs = Math.round(clip.start * 1000);
      const aLabel = `aa${inIdx}`;
      let af = `adelay=${delayMs}|${delayMs},volume=${d.volume.toFixed(3)}`;
      if (d.fadeIn > 0) af += `,afade=t=in:d=${d.fadeIn.toFixed(3)}`;
      if (d.fadeOut > 0) {
        const st = Math.max(0, clip.duration - d.fadeOut);
        af += `,afade=t=out:st=${st.toFixed(3)}:d=${d.fadeOut.toFixed(3)}`;
      }
      if (d.fadeIn === 0 && d.fadeOut === 0) af += `,apad=pad_dur=0.1`;
      filterParts.push(`[${inIdx}:a]${af}[${aLabel}]`);
      audioStreams.push(`[${aLabel}]`);
    }
  }

  let mapAudio: string;
  if (audioStreams.length === 0) {
    filterParts.push(`aevalsrc=0:channel_layout=stereo:sample_rate=44100:duration=${totalDuration.toFixed(3)}[asilent]`);
    mapAudio = "[asilent]";
  } else if (audioStreams.length === 1) {
    mapAudio = audioStreams[0];
  } else {
    filterParts.push(`${audioStreams.join("")}amix=inputs=${audioStreams.length}:duration=longest:dropout_transition=0[amixed]`);
    mapAudio = "[amixed]";
  }

  // ── Final assembly ────────────────────────────────────────────────────────
  args.push("-filter_complex", filterParts.join(";"));
  args.push("-map", `[${vCurrent}]`);
  args.push("-map", mapAudio);
  args.push(
    "-c:v", "libx264", "-preset", "superfast", "-crf", "23",
    "-c:a", "aac", "-b:a", "128k",
    "-t", totalDuration.toFixed(3),
    "-shortest",
    paths.output,
  );

  return args;
}
