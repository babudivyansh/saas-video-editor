"use client";

import React, { useEffect, useRef, useState } from "react";

type RevealProps = {
  children: React.ReactNode;
  /** Stagger delay in ms before the reveal transition runs. */
  delay?: number;
  /** Element tag to render. Defaults to "div". */
  as?: React.ElementType;
  className?: string;
};

// Lightweight scroll-reveal wrapper. Adds `.is-visible` once the element first
// enters the viewport (see `.reveal` styles in globals.css). One-shot.
//
// Resilient by design: uses IntersectionObserver as the primary trigger, but
// also does an immediate bounding-rect check on mount and a passive scroll
// fallback. This guarantees content is never left permanently hidden even in
// environments where IntersectionObserver fails to report intersection.
export default function Reveal({ children, delay = 0, as: Tag = "div", className = "" }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let done = false;

    const inView = () => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      return r.top < vh * 0.92 && r.bottom > 0;
    };

    const reveal = () => {
      if (done) return;
      done = true;
      setVisible(true);
      cleanup();
    };

    const cleanup = () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) reveal();
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );

    const onScroll = () => {
      if (inView()) reveal();
    };

    // Above-the-fold content reveals immediately; the rest waits for scroll.
    if (inView()) {
      reveal();
      return;
    }

    io.observe(el);
    window.addEventListener("scroll", onScroll, { passive: true });
    return cleanup;
  }, []);

  return (
    <Tag
      ref={ref}
      className={`reveal ${visible ? "is-visible" : ""} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
