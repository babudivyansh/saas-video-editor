"use client";

// The repeated "row of buttons, one active, accent-tinted when selected"
// pattern (Speed/Filter/Effect/Transition grids, the top bar's aspect picker).

import React from "react";
import { motion } from "framer-motion";

export default function PillGroup<T extends string | number>({
  options,
  value,
  onChange,
  layoutId,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  /** Distinct per instance so framer-motion's shared-layout animation
   *  doesn't jump between unrelated pill groups on the page. */
  layoutId: string;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={String(o.key)}
          type="button"
          onClick={() => onChange(o.key)}
          className="relative rounded-editor-sm px-2.5 py-1 text-[11px] font-semibold text-editor-text-muted transition-colors cursor-pointer hover:text-editor-text"
        >
          {value === o.key && (
            <motion.span
              layoutId={layoutId}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 rounded-editor-sm bg-editor-accent/15"
            />
          )}
          <span className={`relative ${value === o.key ? "text-editor-accent" : ""}`}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
