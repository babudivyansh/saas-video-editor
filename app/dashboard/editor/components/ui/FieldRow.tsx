"use client";

import React from "react";

export default function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs font-medium text-editor-text-muted">
      {label}
      {children}
    </label>
  );
}
