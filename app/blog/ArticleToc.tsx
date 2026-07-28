"use client";

import { useEffect, useState } from "react";
import type { TocItem } from "./utils";

/**
 * Receives its items already slugified from the server so the ids here and the
 * ids on the rendered <h2>s come from one computation — see getTocItems.
 *
 * A client component only because the active-section highlight needs an
 * IntersectionObserver; the links themselves are plain anchors and work with
 * JavaScript disabled.
 */
export default function ArticleToc({ items, className = "" }: { items: TocItem[]; className?: string }) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    if (items.length === 0) return;

    // Driven by scroll position rather than an IntersectionObserver: a jump
    // from a TOC link can move a heading clean through the observer's band
    // between frames, so no intersecting entry is ever reported and the
    // highlight sticks to wherever the reader came from. Reading geometry on
    // scroll always reflects where the reader actually is.
    const update = () => {
      const positions = items
        .map((item) => ({ id: item.id, top: document.getElementById(item.id)?.getBoundingClientRect().top }))
        .filter((p): p is { id: string; top: number } => p.top !== undefined);
      if (positions.length === 0) return;

      // The last heading scrolled past the navbar line is the one being read;
      // above the first heading, highlight nothing rather than guessing.
      // The line has to sit below the largest scroll-margin-top among the
      // headings (96px on blog posts, 128px on legal documents) or clicking a
      // TOC link lands its target just short of the line and highlights the
      // previous section instead.
      const passed = positions.filter((p) => p.top <= 140);
      setActiveId(passed.length > 0 ? passed[passed.length - 1].id : "");
    };

    // Coalesced to one measurement per frame so a scroll never triggers a
    // burst of layout reads.
    // Throttled on a timestamp rather than requestAnimationFrame: a frame
    // requested while the tab is hidden never runs, so an rAF-gated handler
    // stops tracking until the tab is shown again. A trailing timer catches
    // the final position after the reader stops scrolling.
    let last = 0;
    let trailing: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      const now = Date.now();
      clearTimeout(trailing);
      if (now - last >= 80) {
        last = now;
        update();
      } else {
        trailing = setTimeout(update, 80);
      }
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      clearTimeout(trailing);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [items]);

  if (items.length === 0) return null;

  return (
    <nav aria-label="On this page" className={className}>
      <p className="text-xs font-bold uppercase tracking-widest text-ink-soft">On this page</p>
      <ul className="mt-3 space-y-2 border-l border-card-border">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={activeId === item.id ? "location" : undefined}
              className={`-ml-px block border-l-2 pl-3 text-sm leading-snug transition-colors ${
                activeId === item.id
                  ? "border-brand font-semibold text-brand"
                  : "border-transparent text-ink-soft hover:border-card-border hover:text-ink"
              }`}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
