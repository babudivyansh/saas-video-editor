"use client";

// Playback engine: a requestAnimationFrame master clock drives timeline time,
// independent of any <video> element's own clock. Each frame we compute which
// video/audio clip should be active and keep the media elements in sync
// (drift-corrected), so multi-clip playback and gaps behave deterministically.

import { useEffect, useRef } from "react";
import { useEditorStore } from "../store/editorStore";
import { audioClipAt, docDuration, videoClipAt } from "@/lib/editor/doc-utils";
import {
  EFFECT_PRESETS,
  FILTER_PRESETS,
  TRANSITION_DURATION_SEC,
  TRANSITION_PRESETS,
} from "@/lib/editor/types";

const DRIFT_TOLERANCE = 0.15; // seconds before we hard-correct a media element

export interface MediaRegistry {
  /** assetId → media element rendered by PreviewStage */
  videos: Map<string, HTMLVideoElement>;
  audios: Map<string, HTMLAudioElement>;
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
        const dt = lastTick.current == null ? 0 : (now - lastTick.current) / 1000;
        lastTick.current = now;
        const total = docDuration(s.doc);
        let t = s.currentTime + dt;
        if (t >= total) {
          t = total;
          s.setPlaying(false);
        }
        s.setCurrentTime(t);
      } else {
        lastTick.current = null;
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
          el.muted = active.muted;
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
          el.style.opacity = String(Math.max(0, Math.min(1, opacity)));
          // Color filter preview: same preset family the export burns in.
          // "none" clears the inline style entirely so a class-based effect
          // filter (below) isn't overridden by an inline `filter: none`.
          const css = FILTER_PRESETS[active.filter ?? "none"].css;
          const inlineFilter = css === "none" ? "" : css;
          if (el.style.filter !== inlineFilter) el.style.filter = inlineFilter;
          // Effect preview: CSS keyframe approximation of the export-side
          // ffmpeg effect (classes defined in editor-theme.css).
          const fxClass = EFFECT_PRESETS[active.effect ?? "none"].previewClass ?? "";
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

      // Audio track (music): same treatment.
      const activeAudio = audioClipAt(s.doc, t);
      for (const [assetId, el] of reg.audios) {
        const isActive = activeAudio?.assetId === assetId;
        if (isActive && activeAudio) {
          const target = activeAudio.srcIn + (t - activeAudio.timelineStart);
          if (Math.abs(el.currentTime - target) > DRIFT_TOLERANCE) {
            el.currentTime = target;
          }
          el.volume = activeAudio.volume;
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
