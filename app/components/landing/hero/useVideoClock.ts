"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * The current time of a looping demo video, sampled about 15 times a second
 * while `running`. Overlays (captions, the reframe box, the B-roll cut) read
 * this instead of running their own timers, so they stay locked to the
 * picture even when the browser stalls or the loop restarts.
 */
export function useVideoClock(ref: RefObject<HTMLVideoElement | null>, running: boolean): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last > 66) {
        last = now;
        const v = ref.current;
        if (v) setT(v.currentTime);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ref, running]);
  return t;
}
