"use client";

import FieldRow from "./FieldRow";

export default function TextField({
  label,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit?: () => void;
}) {
  return (
    <FieldRow label={label}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        className="w-32 rounded-editor-sm border border-editor-border bg-editor-card px-2 py-1 text-xs text-editor-text outline-none transition-colors focus:border-editor-accent"
      />
    </FieldRow>
  );
}
