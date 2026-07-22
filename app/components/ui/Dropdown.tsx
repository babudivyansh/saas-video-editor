"use client";

// Generic anchored dropdown panel for the main dashboard design system — a
// composable base for sort menus, filter pickers, tag/folder pickers, etc.
// (ContextMenu.tsx is the cursor-anchored, right-click sibling of this.)

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMenuNav } from "./useMenuNav";

interface DropdownProps {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (props: { close: () => void }) => React.ReactNode;
  align?: "left" | "right";
  className?: string;
}

export function Dropdown({ trigger, children, align = "left", className = "" }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useMenuNav(panelRef, open);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            role="menu"
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.12 }}
            className={`absolute top-full mt-2 z-40 min-w-[10rem] rounded-2xl border border-card-border bg-white shadow-xl overflow-hidden ${align === "right" ? "right-0" : "left-0"} ${className}`}
          >
            {children({ close: () => setOpen(false) })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function DropdownItem({
  onClick, children, danger, icon,
}: { onClick: () => void; children: React.ReactNode; danger?: boolean; icon?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      role="menuitem"
      className={`w-full flex items-center gap-2 text-left text-sm px-3.5 py-2.5 transition-colors cursor-pointer focus-visible:bg-tint-blue focus-visible:outline-none ${
        danger ? "text-red-600 hover:bg-red-50" : "text-ink hover:bg-tint-blue"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
