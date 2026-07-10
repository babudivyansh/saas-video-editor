"use client";

import FieldRow from "./FieldRow";

export default function ColorField({
  label,
  value,
  onChange,
  allowNone,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  allowNone?: boolean;
}) {
  return (
    <FieldRow label={label}>
      <span className="flex items-center gap-1.5">
        {allowNone && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className={`rounded-editor-sm px-1.5 py-0.5 text-[10px] cursor-pointer transition-colors ${
              value === null ? "bg-editor-accent/15 text-editor-accent" : "text-editor-text-muted hover:text-editor-text"
            }`}
          >
            None
          </button>
        )}
        <input
          type="color"
          value={value ?? "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-8 cursor-pointer rounded-editor-sm border border-editor-border bg-editor-card p-0"
        />
      </span>
    </FieldRow>
  );
}
