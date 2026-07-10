"use client";

// Label-less full-width search box — not `TextField` (which is FieldRow-
// wrapped with a mandatory label).

import React from "react";
import { Search } from "lucide-react";

export default function SearchField({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-editor-text-faint" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full rounded-editor-md border border-editor-border bg-editor-card py-2 pr-3 pl-8 text-sm text-editor-text outline-none transition-colors placeholder:text-editor-text-faint focus:border-editor-accent"
      />
    </div>
  );
}
