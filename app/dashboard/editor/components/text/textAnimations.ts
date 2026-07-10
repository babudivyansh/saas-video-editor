"use client";

// Text entrance/loop/exit animations — PREVIEW-ONLY (see TextClip.entrance/
// loop/exit in lib/editor/types.ts; the ffmpeg export ignores these).
//
// Entrance/exit are computed as plain interpolated inline styles, purely as a
// function of (currentTime - clip.timelineStart) — NOT framer-motion's
// mount-triggered `animate` transition system, which has no "correct state at
// arbitrary scrub position X" concept. The rest of the editor already treats
// `currentTime` as the single deterministic source of truth (see
// hooks/usePlayback.ts), so scrubbing the timeline to any point must show the
// exact right animation frame, not just "whatever framer-motion's internal
// clock happened to reach." Loop animations are the one exception: they're
// continuous/decorative with no "correct" frame to match, so they use real
// framer-motion `animate` + `repeat: Infinity`.

import type { CSSProperties, ComponentProps } from "react";
import type { motion } from "framer-motion";
import type { TextClip } from "@/lib/editor/types";

type MotionDivProps = ComponentProps<typeof motion.div>;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export interface TextMotionResult {
  /** filter only (blur, during entrance) — deliberately excludes opacity and
   *  transform, which the caller must COMPOSE (multiply / concatenate) with
   *  buildTextCss's own base opacity/transform rather than overwrite via
   *  object spread — see opacityMultiplier and transformExtra below. */
  style: CSSProperties;
  /** Multiply with buildTextCss's own `opacity` (clip.opacity ?? 1) — never
   *  assign directly, or entrance/exit fade would clobber the clip's own
   *  opacity setting instead of combining with it. 1 = no change. */
  opacityMultiplier: number;
  /** Entrance/exit transform functions (scale/translateY) only — merge as
   *  `${baseTransformFromBuildTextCss} ${transformExtra}` when building the
   *  final inline style. Empty string when no entrance/exit is animating. */
  transformExtra: string;
  /** 0..1, set only while entrance.type === "typewriter" is still revealing text. */
  typewriterProgress?: number;
  loopAnimate?: MotionDivProps["animate"];
  loopTransition?: MotionDivProps["transition"];
}

function entranceStyle(type: Exclude<NonNullable<TextClip["entrance"]>["type"], "none" | "typewriter">, progress: number) {
  const eased = easeOutCubic(progress);
  switch (type) {
    case "fade":
      return { opacity: progress, transform: "", filter: "" };
    case "pop":
      return { opacity: progress, transform: `scale(${0.4 + 0.6 * easeOutBack(progress)})`, filter: "" };
    case "slideUp":
      return { opacity: progress, transform: `translateY(${(1 - eased) * 40}px)`, filter: "" };
    case "slideDown":
      return { opacity: progress, transform: `translateY(${-(1 - eased) * 40}px)`, filter: "" };
    case "zoom":
      return { opacity: progress, transform: `scale(${0.3 + 0.7 * eased})`, filter: "" };
    case "bounce":
      return { opacity: progress, transform: `scale(${0.5 + 0.5 * easeOutBack(progress)})`, filter: "" };
    case "blur":
      return { opacity: progress, transform: "", filter: `blur(${(1 - eased) * 10}px)` };
  }
}

function exitStyle(type: Exclude<NonNullable<TextClip["exit"]>["type"], "none">, progress: number) {
  switch (type) {
    case "fade":
      return { opacity: 1 - progress, transform: "" };
    case "slide":
      return { opacity: 1 - progress, transform: `translateY(${progress * 40}px)` };
    case "zoom":
      return { opacity: 1 - progress, transform: `scale(${1 - progress * 0.7})` };
  }
}

export function getTextMotion(clip: TextClip, currentTime: number): TextMotionResult {
  const elapsed = currentTime - clip.timelineStart;

  let opacity = 1;
  const transforms: string[] = [];
  let filter = "";
  let typewriterProgress: number | undefined;

  if (clip.entrance && clip.entrance.type !== "none") {
    const { type, duration, delay } = clip.entrance;
    const progress = duration > 0 ? clamp01((elapsed - delay) / duration) : 1;
    if (type === "typewriter") {
      if (progress < 1) typewriterProgress = progress;
    } else {
      const e = entranceStyle(type, progress);
      opacity *= e.opacity;
      if (e.transform) transforms.push(e.transform);
      if (e.filter) filter = e.filter;
    }
  }

  if (clip.exit && clip.exit.type !== "none") {
    const { type, duration, delay } = clip.exit;
    const exitStart = clip.duration - delay - duration;
    const progress = duration > 0 ? clamp01((elapsed - exitStart) / duration) : 0;
    const x = exitStyle(type, progress);
    opacity *= x.opacity;
    if (x.transform) transforms.push(x.transform);
  }

  const style: CSSProperties = {};
  if (filter) style.filter = filter;
  const transformExtra = transforms.join(" ");

  let loopAnimate: MotionDivProps["animate"];
  let loopTransition: MotionDivProps["transition"];
  if (clip.loop && clip.loop.type !== "none") {
    const speed = clip.loop.speed || 1;
    switch (clip.loop.type) {
      case "float":
        loopAnimate = { y: [0, -8, 0] };
        loopTransition = { duration: 2 / speed, repeat: Infinity, ease: "easeInOut" };
        break;
      case "pulse":
        loopAnimate = { scale: [1, 1.08, 1] };
        loopTransition = { duration: 1.2 / speed, repeat: Infinity, ease: "easeInOut" };
        break;
      case "wiggle":
        loopAnimate = { rotate: [0, -3, 3, -3, 0] };
        loopTransition = { duration: 1 / speed, repeat: Infinity, ease: "easeInOut" };
        break;
      case "glow":
        loopAnimate = {
          filter: [
            "drop-shadow(0 0 2px currentColor)",
            "drop-shadow(0 0 14px currentColor)",
            "drop-shadow(0 0 2px currentColor)",
          ],
        };
        loopTransition = { duration: 1.6 / speed, repeat: Infinity, ease: "easeInOut" };
        break;
    }
  }

  return { style, opacityMultiplier: opacity, transformExtra, typewriterProgress, loopAnimate, loopTransition };
}
