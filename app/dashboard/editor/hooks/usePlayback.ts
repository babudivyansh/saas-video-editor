"use client";

// Playback engine: a requestAnimationFrame master clock drives timeline time,
// independent of any <video> element's own clock. Each frame we compute which
// video/audio clip should be active and keep the media elements in sync
// (drift-corrected), so multi-clip playback and gaps behave deterministically.

import { useEffect, useRef } from "react";
import { useEditorStore } from "../store/editorStore";
import { audioClipAt, docDuration, videoClipAt } from "@/lib/editor/doc-utils";

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
          const target = active.srcIn + (t - active.timelineStart);
          if (Math.abs(el.currentTime - target) > DRIFT_TOLERANCE) {
            el.currentTime = target;
          }
          el.muted = active.muted;
          el.volume = active.volume;
          el.style.opacity = "1";
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
