"use client";

// Generates a small filmstrip of frame thumbnails for a video asset by
// seeking an offscreen <video> and capturing canvas snapshots. Cached per
// asset URL (module-level) so multiple clips referencing the same asset —
// or re-renders while dragging/trimming — don't regenerate the strip.

import { useEffect, useState } from "react";

const cache = new Map<string, string[]>();
const pending = new Map<string, Promise<string[]>>();

function generate(url: string, count: number): Promise<string[]> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "auto";
    video.src = url;

    const canvas = document.createElement("canvas");
    const frames: string[] = [];
    let index = 0;

    const finish = () => resolve(frames);

    video.onerror = finish;

    video.onloadedmetadata = () => {
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) return finish();
      canvas.width = 160;
      canvas.height = Math.round((video.videoHeight / video.videoWidth) * 160) || 90;
      seekNext();
    };

    function seekNext() {
      if (index >= count) return finish();
      const t = (video.duration * (index + 0.5)) / count;
      video.currentTime = Math.min(t, Math.max(0, video.duration - 0.05));
    }

    video.onseeked = () => {
      try {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.push(canvas.toDataURL("image/jpeg", 0.6));
        }
      } catch {
        // canvas tainted or decode error — skip this frame
      }
      index += 1;
      if (index >= count) finish();
      else seekNext();
    };
  });
}

export function useVideoThumbnails(url: string | null, count = 6): string[] {
  const [frames, setFrames] = useState<string[]>(() => (url ? cache.get(url) ?? [] : []));

  useEffect(() => {
    if (!url) return;
    if (cache.has(url)) {
      setFrames(cache.get(url)!);
      return;
    }
    let cancelled = false;
    const inFlight = pending.get(url) ?? generate(url, count);
    pending.set(url, inFlight);
    inFlight.then((result) => {
      cache.set(url, result);
      pending.delete(url);
      if (!cancelled) setFrames(result);
    });
    return () => {
      cancelled = true;
    };
  }, [url, count]);

  return frames;
}
