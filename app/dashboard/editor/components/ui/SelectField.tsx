"use client";

import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import FieldRow from "./FieldRow";

export default function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <FieldRow label={label}>
      <div ref={ref} className="relative w-32">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-1 rounded-editor-sm border border-editor-border bg-editor-card px-2 py-1 text-xs text-editor-text outline-none transition-colors cursor-pointer hover:border-editor-border-strong"
        >
          <span className="truncate">{value}</span>
          <ChevronDown className={`h-3 w-3 flex-shrink-0 text-editor-text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.12 }}
              className="absolute top-full left-0 z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-editor-md border border-editor-border bg-editor-elevated p-1 shadow-editor-lg"
            >
              {options.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => {
                    onChange(o);
                    setOpen(false);
                  }}
                  className={`block w-full truncate rounded-editor-sm px-2 py-1 text-left text-xs transition-colors cursor-pointer ${
                    o === value ? "bg-editor-accent/15 text-editor-accent" : "text-editor-text-muted hover:bg-editor-card hover:text-editor-text"
                  }`}
                >
                  {o}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </FieldRow>
  );
}
