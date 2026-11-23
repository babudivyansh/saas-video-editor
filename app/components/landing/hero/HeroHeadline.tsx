"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

// The hero's eyebrow and headline: "Create [phrase] / from long videos in
// seconds", where the phrase sits in a rounded pill over a slow, blurred
// drift of the brand greens and rotates through the formats Clipiro makes.
//
// The server HTML (and so what search engines and no-JS visitors read) is
// the first phrase, which keeps the h1 word for word the same as the page
// title and the share image. The pill is not a live region: a screen reader
// reads whichever phrase is showing when it reaches the heading, and is not
// interrupted every few seconds.

const PHRASES = ["viral shorts", "YouTube Shorts", "Instagram Reels", "captioned clips"];
const ROTATE_MS = 2600;

function PhrasePill({ phrase }: { phrase: string }) {
  return (
    <motion.span
      layout
      transition={{ layout: { type: "spring", stiffness: 210, damping: 26 } }}
      className="relative inline-flex overflow-hidden rounded-full bg-surface-3/80 px-[0.42em] pb-[0.1em] pt-[0.04em] align-middle ring-1 ring-white/10"
    >
      {/* The drifting colour behind the words. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0">
        <span className="hero-pill-blob absolute -left-[10%] top-[-30%] h-[150%] w-[45%] rounded-full bg-emerald-brand/60 blur-2xl" />
        <span className="hero-pill-blob absolute left-[35%] top-[-20%] h-[140%] w-[40%] rounded-full bg-primary/35 blur-2xl [animation-delay:-2.5s]" />
        <span className="hero-pill-blob absolute -right-[8%] top-[-30%] h-[150%] w-[45%] rounded-full bg-emerald-bright/45 blur-2xl [animation-delay:-5s]" />
      </span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={phrase}
          layout="position"
          className="relative whitespace-nowrap text-fg/85"
          initial={{ opacity: 0, y: "45%", filter: "blur(10px)" }}
          animate={{ opacity: 1, y: "0%", filter: "blur(0px)" }}
          exit={{ opacity: 0, y: "-45%", filter: "blur(10px)" }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          {phrase}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
}

export default function HeroHeadline() {
  const reduce = useReducedMotion() === true;
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % PHRASES.length), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [reduce]);

  return (
    <div className="flex flex-col items-center gap-4 md:gap-6">
      <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-fg-subtle md:text-[13px]">
        AI video clipper for creators
      </p>
      <h1 className="max-w-[68.75rem] text-[34px] font-bold leading-[1.08] tracking-[-0.035em] text-fg sm:text-[44px] md:text-[60px] md:leading-[1.05] lg:text-[4.125rem]">
        <span className="inline-flex flex-wrap items-center justify-center gap-x-[0.28em] gap-y-2">
          <span>Create</span> <PhrasePill phrase={PHRASES[i]} />
        </span>{" "}
        <span className="mt-1 block text-balance md:mt-2">from long videos in seconds</span>
      </h1>
    </div>
  );
}
