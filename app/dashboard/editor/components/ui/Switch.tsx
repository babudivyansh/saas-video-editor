"use client";

import { motion } from "framer-motion";

export default function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 flex-shrink-0 rounded-editor-full transition-colors cursor-pointer ${
        checked ? "bg-editor-accent" : "bg-editor-card border border-editor-border"
      }`}
    >
      <motion.span
        layout
        transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
        className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-editor-sm"
        style={{ left: checked ? "calc(100% - 18px)" : 2 }}
      />
    </button>
  );
}
