"use client";

// Section replacement: a bordered card with a header row and animated
// collapse. Same title/children contract as the old `Section`, plus optional
// collapsible/defaultOpen.

import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

export default function PropertyCard({
  title,
  children,
  collapsible = true,
  defaultOpen = true,
  trailing,
}: {
  title: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  trailing?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-editor-md border border-editor-border bg-editor-card">
      <button
        type="button"
        onClick={() => collapsible && setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left ${collapsible ? "cursor-pointer" : "cursor-default"}`}
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-editor-text-muted">{title}</span>
        <span className="flex items-center gap-2">
          {trailing}
          {collapsible && (
            <ChevronDown className={`h-3.5 w-3.5 text-editor-text-faint transition-transform ${open ? "rotate-180" : ""}`} />
          )}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div className="flex flex-col gap-2.5 px-3 pb-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
