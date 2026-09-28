"use client";

// One place that makes every framer-motion animation respect the OS "reduce
// motion" setting. Without it, modals, toasts, dropdowns and the settings
// overlay all slid and scaled regardless — the CSS animations already honoured
// prefers-reduced-motion, framer-motion's did not.
import { MotionConfig } from "framer-motion";

export default function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
