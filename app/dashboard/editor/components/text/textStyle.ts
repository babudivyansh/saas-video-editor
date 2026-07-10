"use client";

// Maps a TextClip's style fields to CSS for the live canvas preview. Some of
// these render differently (or only exist) here vs. the ffmpeg export — see
// the field comments on TextClip in lib/editor/types.ts for the export
// contract of each field (stroke/shadow/opacity/lineHeight/textTransform
// export for real; gradient/letterSpacing/rotation are preview-only).

import type { CSSProperties } from "react";

// Covers exactly the fields this function reads — TextClip and CaptionClip
// both structurally satisfy this without any cast. CaptionClip doesn't carry
// align/gradient/rotationDeg (all optional here, safely no-op when absent —
// align defaults to "center" below, matching how captions are always
// center-block per subtitle convention).
export interface TypographyLike {
  fontFamily: string;
  fontSizePct: number;
  color: string;
  bold: boolean;
  bgColor: string | null;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  opacity?: number;
  letterSpacingPx?: number;
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  strokeColor?: string | null;
  strokeWidthPct?: number;
  shadow?: { color: string; offsetXPct: number; offsetYPct: number; opacity: number; blurPx?: number } | null;
  gradient?: { from: string; to: string; angleDeg: number } | null;
  rotationDeg?: number;
}

function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

export function buildTextCss(clip: TypographyLike, stageH: number, stageW: number): CSSProperties {
  const style: CSSProperties = {
    fontFamily: clip.fontFamily,
    fontWeight: clip.bold ? 700 : 400,
    fontSize: `${clip.fontSizePct * stageH}px`,
    color: clip.color,
    textAlign: clip.align ?? "center",
    backgroundColor: clip.bgColor ?? "transparent",
    borderRadius: clip.bgColor ? 6 : 0,
    lineHeight: clip.lineHeight ?? 1.2,
    maxWidth: "90%",
    opacity: clip.opacity ?? 1,
  };

  if (clip.letterSpacingPx) style.letterSpacing = `${clip.letterSpacingPx}px`;
  if (clip.textTransform && clip.textTransform !== "none") style.textTransform = clip.textTransform;

  // Preview-only stroke rendering (-webkit-text-stroke) — intentionally a
  // different visual than export's drawtext `borderw` (outline vs. offset
  // double-strike), since there's no browser equivalent of drawtext's method.
  if (clip.strokeColor) {
    const strokeW = (clip.strokeWidthPct ?? 0.01) * stageH;
    style.WebkitTextStroke = `${strokeW}px ${clip.strokeColor}`;
  }

  // Preview gets real blur (drawtext's shadowx/shadowy/shadowcolor has none).
  if (clip.shadow) {
    const { color, offsetXPct, offsetYPct, opacity, blurPx } = clip.shadow;
    const offsetX = offsetXPct * stageW;
    const offsetY = offsetYPct * stageH;
    style.textShadow = `${offsetX}px ${offsetY}px ${blurPx ?? 0}px ${hexWithAlpha(color, opacity)}`;
  }

  // Preview-only — export has no gradient-fill equivalent, falls back to flat `color`.
  if (clip.gradient) {
    const { from, to, angleDeg } = clip.gradient;
    style.backgroundImage = `linear-gradient(${angleDeg}deg, ${from}, ${to})`;
    style.WebkitBackgroundClip = "text";
    style.backgroundClip = "text";
    style.color = "transparent";
  }

  // Base translate keeps the clip centered on its x/y anchor point — kept as
  // an explicit transform (rather than the Tailwind -translate-x-1/2 utility)
  // so it composes with preview-only rotation.
  const rotate = clip.rotationDeg ? ` rotate(${clip.rotationDeg}deg)` : "";
  style.transform = `translate(-50%, -50%)${rotate}`;

  return style;
}
