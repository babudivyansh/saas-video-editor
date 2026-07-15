"use client";
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { TOUR_STEPS } from "@/lib/onboarding-tour-config";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface ProductTourProps {
  startStep: number;
  onAdvance: (step: number) => void;
  onFinish: () => void;
  onSkip: () => void;
}

const PAD = 8;

function measure(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function ProductTour({ startStep, onAdvance, onFinish, onSkip }: ProductTourProps) {
  const [step, setStep] = useState(startStep);
  const [rect, setRect] = useState<Rect | null>(null);
  const reduceMotion = useReducedMotion();

  const current = TOUR_STEPS[step];

  const recompute = useCallback(() => {
    if (!current) return;
    const r = measure(current.selector);
    // Target not present (e.g. hidden on smaller viewports) — skip forward
    // rather than leaving the tour stuck with nothing to point at.
    if (!r && step < TOUR_STEPS.length - 1) {
      setStep(s => s + 1);
      return;
    }
    setRect(r);
  }, [current, step]);

  useEffect(() => {
    recompute();
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
  }, [recompute]);

  if (!current || !rect) return null;

  const isLast = step === TOUR_STEPS.length - 1;

  function goNext() {
    if (isLast) {
      onFinish();
      return;
    }
    const next = step + 1;
    setStep(next);
    onAdvance(next);
  }

  function goPrev() {
    if (step === 0) return;
    const prev = step - 1;
    setStep(prev);
    onAdvance(prev);
  }

  // Tooltip placement: below the target if there's room, otherwise above.
  const spaceBelow = window.innerHeight - (rect.top + rect.height);
  const placeBelow = spaceBelow > 180;
  const cardWidth = 300;
  const left = Math.min(Math.max(rect.left, 16), window.innerWidth - cardWidth - 16);
  const top = placeBelow ? rect.top + rect.height + 16 : undefined;
  const bottom = placeBelow ? undefined : window.innerHeight - rect.top + 16;

  const transition = reduceMotion ? { duration: 0 } : { type: "spring" as const, stiffness: 300, damping: 30 };

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Product tour">
      <motion.div
        layout
        transition={transition}
        className="fixed rounded-2xl pointer-events-none"
        style={{
          top: rect.top - PAD,
          left: rect.left - PAD,
          width: rect.width + PAD * 2,
          height: rect.height + PAD * 2,
          boxShadow: "0 0 0 9999px rgba(15,23,32,0.65)",
        }}
      />
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          layout
          initial={reduceMotion ? false : { opacity: 0, y: placeBelow ? -8 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={transition}
          className="fixed w-[300px] rounded-2xl bg-white shadow-2xl p-5"
          style={{ left, top, bottom }}
        >
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
            Step {step + 1} of {TOUR_STEPS.length}
          </p>
          <p className="text-sm font-bold text-ink mb-1">{current.title}</p>
          <p className="text-xs text-ink-soft leading-relaxed mb-4">{current.body}</p>
          <div className="flex items-center justify-between">
            <button
              onClick={onSkip}
              className="text-xs text-gray-400 hover:text-ink-soft transition-colors"
            >
              Skip tour
            </button>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  onClick={goPrev}
                  className="text-xs font-semibold text-ink-soft hover:text-ink px-3 py-1.5 rounded-full transition-colors"
                >
                  Back
                </button>
              )}
              <button
                onClick={goNext}
                className="text-xs font-semibold text-white grad-brand px-3.5 py-1.5 rounded-full shadow-glow hover:shadow-glow-hover transition-all"
              >
                {isLast ? "Done" : "Next"}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
