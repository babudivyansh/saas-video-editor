"use client";

import FieldRow from "./FieldRow";

export default function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <FieldRow label={label}>
      <input
        type="number"
        value={Number(value.toFixed(2))}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="w-20 rounded-editor-sm border border-editor-border bg-editor-card px-2 py-1 text-right text-xs text-editor-text outline-none transition-colors focus:border-editor-accent"
      />
    </FieldRow>
  );
}
