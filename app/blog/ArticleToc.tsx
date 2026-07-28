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

    const observer = new IntersectionObserver(
      (entries) => {
        // Prefer the heading nearest the top of the viewport among those
        // currently intersecting, so scrolling up highlights the section you
        // are entering rather than the one you are leaving.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      // Top inset clears the sticky navbar; the large bottom inset keeps only
      // headings in the upper part of the viewport eligible.
      { rootMargin: "-96px 0px -66% 0px", threshold: 0 },
    );

    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
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
