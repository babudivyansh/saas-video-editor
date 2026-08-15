"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

/**
 * A product screenshot in a browser frame, drifting gently against the scroll.
 *
 * The only client component on the tool pages, so the parallax is hand-rolled
 * rather than pulled from framer-motion: this ships a few hundred bytes where
 * `useScroll`/`useTransform` would add tens of kilobytes to a route that
 * otherwise runs on almost no JS.
 */
export default function ToolShot({
  src,
  alt,
  width,
  height,
  blurDataURL,
  priority = false,
  caption,
  className = "",
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  blurDataURL: string;
  /** Set on the hero shot only — it is the LCP candidate. */
  priority?: boolean;
  caption?: string;
  className?: string;
}) {
  const { frameRef, innerRef } = useParallax();

  return (
    <figure className={`group relative ${className}`}>
      {/* Soft brand wash behind the frame, matching the landing hero. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-4 -z-10 rounded-[32px] bg-brand/20 blur-2xl"
      />

      <div
        ref={frameRef}
        className="overflow-hidden rounded-2xl border border-card-border bg-white shadow-2xl"
      >
        {/* Faux window chrome — the same idiom as the landing hero mockup. */}
        <div className="flex items-center gap-2 border-b border-card-border bg-surface px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-red-400" />
          <span className="h-3 w-3 rounded-full bg-yellow-400" />
          <span className="h-3 w-3 rounded-full bg-green-400" />
          <span className="ml-3 hidden rounded-full bg-white px-3 py-1 text-[11px] font-medium text-ink-soft sm:block">
            clipiro.com
          </span>
        </div>

        {/* Two nested transforms, deliberately: the parallax writes to this
            element every frame and must NOT be transitioned, while the hover
            scale below wants a 500ms ease. Sharing one element smears each
            scroll update over half a second and the drift turns to mush. */}
        <div ref={innerRef} className="will-change-transform">
          {/* The image scales inside the clipped frame, so the frame's own
              edges stay put while the screenshot fills toward them. */}
          <div className="transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.03]">
            <Image
              src={src}
              alt={alt}
              width={width}
              height={height}
              placeholder="blur"
              blurDataURL={blurDataURL}
              priority={priority}
              // Screenshots carry small UI text that the default 75 softens.
              // Allowlisted in next.config.ts, which Next 16 requires.
              quality={90}
              sizes="(min-width: 1280px) 1100px, (min-width: 768px) 90vw, 100vw"
              className="block h-auto w-full"
            />
          </div>
        </div>
      </div>

      {caption && (
        <figcaption className="mt-3 text-[12.5px] leading-[1.6] text-ink-soft">{caption}</figcaption>
      )}
    </figure>
  );
}

/** Vertical travel, in px, across the whole time the frame is on screen. */
const TRAVEL = 14;

/**
 * Drifts `inner` against the scroll while `frame` is visible.
 *
 * Driven by a rAF loop that an IntersectionObserver starts and stops, rather
 * than by a scroll listener. Scroll events are not a dependable signal here —
 * they do not fire at all for programmatic scrolls in some embedded browsers,
 * and they miss momentum scrolling and scroll containers entirely. Reading the
 * rect each frame is correct in every case, and the loop only runs while the
 * frame is actually on screen.
 *
 * Bails out entirely under prefers-reduced-motion — the observer is never even
 * attached, mirroring how TimeSeriesChart gates its draw-in rather than
 * relying on the CSS media query alone.
 *
 * Owns its refs rather than taking them as arguments: writing to a ref passed
 * in as a hook argument trips the React Compiler's immutability rule.
 */
function useParallax() {
  const frameRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frameEl = frameRef.current;
    const innerEl = innerRef.current;
    if (!frameEl || !innerEl) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let rafId = 0;
    // Not NaN: the skip-if-unchanged guard below compares with Math.abs, and
    // any comparison against NaN is false — which would suppress every write.
    let last = Number.POSITIVE_INFINITY;

    const apply = () => {
      const rect = frameEl.getBoundingClientRect();
      const viewport = window.innerHeight || document.documentElement.clientHeight;
      // 0 when the frame's top hits the bottom of the viewport, 1 when its
      // bottom clears the top — so the drift is symmetric about centre.
      const progress = (viewport - rect.top) / (viewport + rect.height);
      const offset = (Math.min(Math.max(progress, 0), 1) - 0.5) * -2 * TRAVEL;
      // Skip the style write when nothing moved, so a parked page does no work.
      if (Math.abs(offset - last) > 0.05) {
        last = offset;
        innerEl.style.transform = `translate3d(0, ${offset.toFixed(2)}px, 0)`;
      }
    };

    const tick = () => {
      apply();
      rafId = requestAnimationFrame(tick);
    };

    // Both signals, because neither is reliable alone: rAF is throttled to a
    // stop whenever the page is not compositing (backgrounded tab, hidden
    // panel), and scroll events do not fire for programmatic scrolls in some
    // embedded browsers, nor inside scroll containers. Whichever is alive
    // drives it; `last` keeps the duplicate work to a comparison.
    const onScroll = () => apply();

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (visible) {
          apply();
          if (!rafId) rafId = requestAnimationFrame(tick);
        } else if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
      },
      { threshold: 0 },
    );
    io.observe(frameEl);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    apply();

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafId) cancelAnimationFrame(rafId);
      // Leave no transform behind, or a re-mount inherits the last offset.
      innerEl.style.transform = "";
    };
  }, []);

  return { frameRef, innerRef };
}
