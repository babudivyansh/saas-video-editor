"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

// A looping clock for template previews. One shared timer drives every
// subscribed card (cards subscribe only while on screen), so a grid of 50
// animated previews costs one interval, not 50.

type Listener = (now: number) => void;
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  if (!timer) timer = setInterval(() => { const now = performance.now(); listeners.forEach((l) => l(now)); }, 50);
  return () => {
    listeners.delete(fn);
    if (!listeners.size && timer) { clearInterval(timer); timer = null; }
  };
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Time in ms within a `lengthMs` loop, advancing only while `ref` is visible
 * and `active`. Starts at `restMs` (a representative frame) so a paused or
 * off-screen card still shows a meaningful still.
 */
export function useDemoClock(ref: RefObject<Element | null>, lengthMs: number, restMs: number, active = true): number {
  const [t, setT] = useState(restMs);
  const [visible, setVisible] = useState(false);
  const origin = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "80px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  useEffect(() => {
    if (!visible || !active || reducedMotion() || lengthMs <= 0) return;
    origin.current = null;
    return subscribe((now) => {
      if (origin.current === null) origin.current = now - restMs;
      setT((now - origin.current) % lengthMs);
    });
  }, [visible, active, lengthMs, restMs]);

  return t;
}
