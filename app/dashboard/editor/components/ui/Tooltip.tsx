"use client";

// Portal-based tooltip (no radix Popover in this repo) — fades/scales in
// after a short hover delay, positioned from the trigger's bounding box.

import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

type Side = "top" | "right" | "bottom" | "left";

export default function Tooltip({
  content,
  children,
  side = "right",
  delay = 300,
}: {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: Side;
  delay?: number;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    timer.current = setTimeout(() => {
      if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
      setOpen(true);
    }, delay);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  };

  const trigger = React.cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
    },
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
  } as React.HTMLAttributes<HTMLElement> & { ref: (node: HTMLElement | null) => void });

  const pos = rect ? positionFor(side, rect) : null;

  return (
    <>
      {trigger}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && pos && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.12 }}
                style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 100 }}
                className="pointer-events-none rounded-editor-sm border border-editor-border bg-editor-elevated px-2 py-1 text-[11px] font-medium whitespace-nowrap text-editor-text shadow-editor-md"
              >
                {content}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

function positionFor(side: Side, rect: DOMRect) {
  const gap = 8;
  switch (side) {
    case "right":
      return { top: rect.top + rect.height / 2 - 12, left: rect.right + gap };
    case "left":
      return { top: rect.top + rect.height / 2 - 12, left: rect.left - gap - 100 };
    case "top":
      return { top: rect.top - gap - 28, left: rect.left + rect.width / 2 - 40 };
    case "bottom":
    default:
      return { top: rect.bottom + gap, left: rect.left + rect.width / 2 - 40 };
  }
}
