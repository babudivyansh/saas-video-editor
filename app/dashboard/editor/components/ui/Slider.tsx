"use client";

import FieldRow from "./FieldRow";
import { SLIDER_THUMB_CLASSES, sliderTrackStyle } from "./sliderStyles";

export default function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
}) {
  return (
    <FieldRow label={label}>
      <span className="flex items-center gap-2">
        <input
          type="range"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={sliderTrackStyle(value, min, max)}
          className={`h-1.5 w-24 cursor-pointer appearance-none rounded-editor-full border border-editor-border outline-none ${SLIDER_THUMB_CLASSES}`}
        />
        <span className="w-8 text-right text-[10px] text-editor-text-muted">{Math.round(value * 100)}%</span>
      </span>
    </FieldRow>
  );
}
