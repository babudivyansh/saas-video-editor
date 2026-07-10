// Shared bare <input type=range> styling (thumb classes + gradient-fill
// track) used by both the Slider primitive and Timeline.tsx's zoom control,
// which has no label so it can't use the FieldRow-wrapped Slider component.

import type { CSSProperties } from "react";

export const SLIDER_THUMB_CLASSES =
  "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 " +
  "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-editor-sm " +
  "[&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-editor-accent [&::-webkit-slider-thumb]:cursor-pointer " +
  "[&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 " +
  "[&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-editor-sm [&::-moz-range-thumb]:cursor-pointer " +
  "[&::-moz-range-thumb]:outline [&::-moz-range-thumb]:outline-1 [&::-moz-range-thumb]:outline-editor-accent";

export function sliderTrackStyle(value: number, min: number, max: number): CSSProperties {
  const pct = ((value - min) / (max - min)) * 100;
  return { background: `linear-gradient(to right, var(--editor-accent) ${pct}%, var(--editor-card) ${pct}%)` };
}
