"use client";

import { useEffect, useRef } from "react";
import { useAnimate, useReducedMotion } from "framer-motion";

// The "link box" inside the AI clipping demo. It is part of the picture, not
// a form or a button: there is nothing to type into or click, and nothing is
// sent anywhere. A drawn hand cursor "clicks" Get clips each round (`press`
// changes): the hand dips, the button pushes in and springs back, and a ring
// ripples out, just before the long video drops through the bar.

const IcLink = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0" aria-hidden="true">
    <path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7" />
  </svg>
);

/** A pointing hand, drawn: the demo's "visitor" clicking Get clips. */
export const HandCursor = () => (
  <svg viewBox="0 0 24 24" className="h-7 w-7 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]" fill="#fff" stroke="#000" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
    <path d="M9 11V4.5a1.5 1.5 0 013 0V10m0-.5a1.5 1.5 0 013 0V11m0-.5a1.5 1.5 0 013 0V12m0-.5a1.5 1.5 0 013 0V16a6 6 0 01-6 6h-1.6a6 6 0 01-4.6-2.2L3.4 15.6a1.6 1.6 0 012.4-2.1L9 16z" />
  </svg>
);

export default function MockClipBar({ press }: { press: number }) {
  const reduce = useReducedMotion() === true;
  const [buttonScope, animateButton] = useAnimate<HTMLSpanElement>();
  const [cursorScope, animateCursor] = useAnimate<HTMLSpanElement>();
  const [rippleScope, animateRipple] = useAnimate<HTMLSpanElement>();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce) return;
    animateCursor(cursorScope.current, { x: [-14, 0, 0, 0], y: [10, 0, 2, 0], scale: [1, 1, 0.84, 1] }, { duration: 0.35, times: [0, 0.4, 0.6, 1] });
    animateButton(buttonScope.current, { scale: [1, 1, 0.93, 1.03, 1] }, { duration: 0.4, times: [0, 0.35, 0.55, 0.8, 1] });
    animateRipple(rippleScope.current, { scale: [1, 1, 1.45], opacity: [0, 0.55, 0] }, { duration: 0.6, times: [0, 0.3, 1] });
  }, [press, reduce, animateButton, buttonScope, animateCursor, cursorScope, animateRipple, rippleScope]);

  return (
    <div
      aria-hidden="true"
      className="flex w-full max-w-[480px] items-center gap-2.5 rounded-full bg-[color-mix(in_oklab,var(--surface-3)_82%,var(--fg)_6%)] p-[5px] pl-[18px] shadow-[0_0_0_1px_var(--line-strong),0_12px_32px_-12px_rgba(0,0,0,0.8)]"
    >
      <span className="text-fg-subtle"><IcLink /></span>
      <span className="min-w-0 flex-1 truncate text-left text-[15px] text-fg-muted">Drop a long video and …</span>
      <span className="relative shrink-0">
        <span ref={rippleScope} className="pointer-events-none absolute inset-0 rounded-full opacity-0 shadow-[0_0_0_2px_var(--fg)]" />
        <span ref={buttonScope} className="flex h-[42px] items-center rounded-full bg-[var(--bg-deep)] px-[22px] text-[15px] font-semibold text-fg">
          Get clips
        </span>
        <span ref={cursorScope} className="pointer-events-none absolute -bottom-[18px] right-1.5 block origin-[30%_10%]">
          <HandCursor />
        </span>
      </span>
    </div>
  );
}
