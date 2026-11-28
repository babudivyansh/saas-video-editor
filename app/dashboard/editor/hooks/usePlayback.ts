"use client";

// Playback engine: a requestAnimationFrame master clock drives timeline time,
// independent of any <video> element's own clock. Each frame we compute which
// video/audio clip should be active and keep the media elements in sync
// (drift-corrected), so multi-clip playback and gaps behave deterministically.

import { useEffect, useRef } from "react";
import { useEditorStore } from "../store/editorStore";
import { audioClipsAt, docDuration, fadeOpacityAt, overlayClipsAt, trackHidden, trackMuted, videoClipAt } from "@/lib/editor/doc-utils";
import type { VideoClip } from "@/lib/editor/types";
import { clipDuckSegments, musicGainAt, speechRangesFromCaptions } from "@/lib/editor/music-envelope";
import { adjustCss, effectActiveAt } from "@/lib/editor/video-look";
import {
  EFFECT_PRESETS,
  FILTER_PRESETS,
  TRANSITION_DURATION_SEC,
  TRANSITION_PRESETS,
} from "@/lib/editor/types";

const DRIFT_TOLERANCE = 0.15; // seconds before we hard-correct a media element
const MAX_TICK_SEC = 0.25; // largest clock step one frame may take

export interface MediaRegistry {
  /** assetId → media element rendered by PreviewStage */
  videos: Map<string, HTMLVideoElement>;
  audios: Map<string, HTMLAudioElement>;
  /** overlay clip id → its <video> (one element per clip, Phase 1) */
  overlays?: Map<string, HTMLVideoElement>;
  /** Blurred backdrop behind a "fit" clip (filtergraph.ts fitStatements). */
  backdrop?: HTMLCanvasElement | null;
}

/** Draws `video` into `canvas` the way object-fit: cover would (the export's
 *  blurred copy is a cover-scaled crop too); CSS adds the blur. */
function drawCover(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
  const ctx = canvas.getContext("2d");
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!ctx || !vw || !vh) return;
  const { width: cw, height: ch } = canvas;
  const s = Math.max(cw / vw, ch / vh);
  ctx.drawImage(video, (cw - vw * s) / 2, (ch - vh * s) / 2, vw * s, vh * s);
}

/** CSS transform for a main-lane clip's position/size/rotation/flip — the
 *  same placement filtergraph.ts transformStatements draws. */
export function videoTransformCss(c: VideoClip): string {
  const parts: string[] = [];
  if (c.offsetX || c.offsetY) parts.push(`translate(${(c.offsetX ?? 0) * 100}%, ${(c.offsetY ?? 0) * 100}%)`);
  if (c.scale !== undefined && c.scale !== 1) parts.push(`scale(${c.scale})`);
  if (c.rotationDeg) parts.push(`rotate(${c.rotationDeg}deg)`);
  if (c.flipH || c.flipV) parts.push(`scale(${c.flipH ? -1 : 1}, ${c.flipV ? -1 : 1})`);
  return parts.join(" ");
}

export function usePlayback(registry: React.RefObject<MediaRegistry>) {
  const rafId = useRef<number>(0);
  const lastTick = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;

    function tick(now: number) {
      if (!mounted) return;
      const s = useEditorStore.getState();
      const reg = registry.current;

      if (s.playing) {
        // Capped: rAF pauses in a background tab and stalls during heavy work
        // (a long seek), and an uncapped gap made the clock leap ahead — a
        // minute in another tab came back as a jump to the end.
        const dt = lastTick.current == null ? 0 : Math.min((now - lastTick.current) / 1000, MAX_TICK_SEC);
        lastTick.current = now;
        const total = docDuration(s.doc);
        const t = s.currentTime + dt;
        if (t >= total) {
          // Reached the end: stop and rewind, so the playhead is back at the
          // start (and the next Play replays) instead of parked on a black
          // frame past the last clip.
          s.setPlaying(false);
          s.setCurrentTime(0);
          lastTick.current = null;
        } else {
          s.setCurrentTime(t);
        }
      } else {
        lastTick.current = null;
        // A delete / trim / undo that shortens the timeline can leave the
        // playhead past the new end; pull it back to the end.
        if (s.currentTime > docDuration(s.doc)) s.setCurrentTime(s.currentTime);
      }

      if (reg) syncMedia(reg);
      rafId.current = requestAnimationFrame(tick);
    }

    function syncMedia(reg: MediaRegistry) {
      const s = useEditorStore.getState();
      const t = s.currentTime;

      // Video track: one active element; pre-seek and pause the rest.
      const active = videoClipAt(s.doc, t);
      for (const [assetId, el] of reg.videos) {
        const isActive = active?.assetId === assetId;
        if (isActive && active) {
          const speed = active.speed ?? 1;
          // Speed maps timeline-time to source-time; the element itself plays
          // at `speed` so between drift corrections it tracks the clock.
          const target = active.srcIn + (t - active.timelineStart) * speed;
          if (Math.abs(el.currentTime - target) > DRIFT_TOLERANCE * Math.max(speed, 1)) {
            el.currentTime = target;
          }
          if (el.playbackRate !== speed) el.playbackRate = speed;
          el.muted = active.muted || trackMuted(s.doc, "video");
          el.volume = active.volume;
          // Fade preview: approximate the export's fade-to-black with opacity.
          const local = t - active.timelineStart;
          const fadeIn = active.fadeIn ?? 0;
          const fadeOut = active.fadeOut ?? 0;
          let opacity = 1;
          if (fadeIn > 0 && local < fadeIn) opacity = Math.min(opacity, local / fadeIn);
          if (fadeOut > 0 && local > active.duration - fadeOut)
            opacity = Math.min(opacity, (active.duration - local) / fadeOut);
          // Transition-out preview: the export crossfades into the next clip
          // (xfade); a single <video> element can't overlap two sources, so
          // approximate every transition as a fade over the same window.
          const xfade = active.transitionOut ? TRANSITION_PRESETS[active.transitionOut].xfade : null;
          if (xfade) {
            const transDur = Math.min(TRANSITION_DURATION_SEC, active.duration);
            if (local > active.duration - transDur)
              opacity = Math.min(opacity, (active.duration - local) / transDur);
          }
          // Clip opacity, and a hidden track shows black (as the export does).
          opacity *= active.opacity ?? 1;
          if (trackHidden(s.doc, "video")) opacity = 0;
          el.style.opacity = String(Math.max(0, Math.min(1, opacity)));
          const transform = videoTransformCss(active);
          if (el.style.transform !== transform) el.style.transform = transform;
          // Framing: the same choice the export's fill/fit filters make.
          // object-position on a cover-fitted element offsets the overflow
          // exactly like crop's x=(in_w-out_w)*focusX.
          const fit = active.fit === "fit" ? "contain" : "cover";
          if (el.style.objectFit !== fit) el.style.objectFit = fit;
          const pos = fit === "cover" ? `${(active.focusX ?? 0.5) * 100}% ${(active.focusY ?? 0.5) * 100}%` : "50% 50%";
          if (el.style.objectPosition !== pos) el.style.objectPosition = pos;
          // Color filter preview: same preset family the export burns in.
          // "none" clears the inline style entirely so a class-based effect
          // filter (below) isn't overridden by an inline `filter: none`.
          const css = FILTER_PRESETS[active.filter ?? "none"].css;
          const inlineFilter = [css === "none" ? "" : css, adjustCss(active.adjust)].filter(Boolean).join(" ");
          if (el.style.filter !== inlineFilter) el.style.filter = inlineFilter;
          // Effect preview: CSS keyframe approximation of the export-side
          // ffmpeg effect (classes defined in editor-theme.css).
          // Only inside the effect window (effect on part of a clip).
          const fxClass = effectActiveAt(active, local) ? EFFECT_PRESETS[active.effect ?? "none"].previewClass ?? "" : "";
          if (el.dataset.fxClass !== fxClass) {
            if (el.dataset.fxClass) el.classList.remove(el.dataset.fxClass);
            if (fxClass) el.classList.add(fxClass);
            el.dataset.fxClass = fxClass;
          }
          if (s.playing && el.paused) el.play().catch(() => {});
          if (!s.playing && !el.paused) el.pause();
        } else {
          el.style.opacity = "0";
          if (!el.paused) el.pause();
        }
      }

      const backdrop = reg.backdrop;
      if (backdrop) {
        const el = active?.fit === "fit" ? reg.videos.get(active.assetId) : undefined;
        if (el && el.readyState >= 2) {
          drawCover(backdrop, el);
          backdrop.style.opacity = el.style.opacity;
          const blur = `blur(10px) ${el.style.filter}`.trim();
          if (backdrop.style.filter !== blur) backdrop.style.filter = blur;
        } else if (backdrop.style.opacity !== "0") {
          backdrop.style.opacity = "0";
        }
      }

      // Overlay videos: each clip has its own element.
      if (reg.overlays) {
        const activeOverlays = overlayClipsAt(s.doc, t);
        const overlayMuted = trackMuted(s.doc, "overlay");
        for (const [clipId, el] of reg.overlays) {
          const clip = activeOverlays.find((c) => c.id === clipId);
          if (clip) {
            const speed = clip.speed ?? 1;
            const target = clip.srcIn + (t - clip.timelineStart) * speed;
            if (Math.abs(el.currentTime - target) > DRIFT_TOLERANCE * Math.max(speed, 1)) el.currentTime = target;
            if (el.playbackRate !== speed) el.playbackRate = speed;
            el.muted = clip.muted || overlayMuted;
            el.volume = clip.volume;
            const o = (clip.opacity ?? 1) * fadeOpacityAt(t - clip.timelineStart, clip.duration, clip.fadeIn, clip.fadeOut);
            el.style.opacity = String(o);
            el.style.pointerEvents = "auto";
            if (s.playing && el.paused) el.play().catch(() => {});
            if (!s.playing && !el.paused) el.pause();
          } else {
            el.style.opacity = "0";
            el.style.pointerEvents = "none";
            if (!el.paused) el.pause();
          }
        }
      }

      // Audio track: every clip under the playhead plays, like the export's
      // amix. Elements are per asset, so one asset used twice at the same
      // instant plays the first clip only.
      const activeAudios = audioClipsAt(s.doc, t);
      const speech = activeAudios.some((c) => c.duck) ? speechRangesFromCaptions(s.doc) : [];
      for (const [assetId, el] of reg.audios) {
        const clip = activeAudios.find((c) => c.assetId === assetId);
        if (clip) {
          const target = clip.srcIn + (t - clip.timelineStart);
          if (Math.abs(el.currentTime - target) > DRIFT_TOLERANCE) {
            el.currentTime = target;
          }
          // Fades and the dip under speech, same envelope the export renders.
          const duckSegs = clip.duck ? clipDuckSegments(clip, speech) : [];
          el.volume = Math.max(0, Math.min(1, musicGainAt(clip, t, duckSegs)));
          if (s.playing && el.paused) el.play().catch(() => {});
          if (!s.playing && !el.paused) el.pause();
        } else if (!el.paused) {
          el.pause();
        }
      }
    }

    rafId.current = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      cancelAnimationFrame(rafId.current);
    };
  }, [registry]);
}
