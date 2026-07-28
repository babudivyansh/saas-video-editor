"use client";

import { useEffect, useState } from "react";

/**
 * Thin progress bar under the navbar, measuring scroll through the article
 * itself rather than the whole document — the footer and "read next" block
 * shouldn't count as article you've read.
 *
 * aria-hidden: this is decoration. The native scrollbar already conveys
 * position to assistive tech, and announcing a continuously-changing
 * percentage would be noise.
 */
export default function ReadingProgress({ targetId }: { targetId: string }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const article = document.getElementById(targetId);
    if (!article) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const { top, height } = article.getBoundingClientRect();
      // Distance scrolled past the article's start, over the distance that can
      // actually be scrolled through it.
      const scrollable = height - window.innerHeight;
      if (scrollable <= 0) {
        setProgress(0);
        return;
      }
      setProgress(Math.min(1, Math.max(0, -top / scrollable)));
    };

    // rAF-throttled: scroll fires far more often than the screen repaints.
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [targetId]);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 bg-transparent">
      <div
        className="h-full origin-left grad-brand motion-safe:transition-transform motion-safe:duration-150"
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  );
}
