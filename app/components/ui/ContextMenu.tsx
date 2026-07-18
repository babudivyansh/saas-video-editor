"use client";

// Cursor-anchored right-click menu for the main dashboard design system.
// Pair with useContextMenu() for the open/position state; renders via
// DropdownItem so context-menu and dropdown-menu rows look identical.

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { DropdownItem } from "./Dropdown";

export { DropdownItem as ContextMenuItem };

interface ContextMenuState {
  x: number;
  y: number;
  data: unknown;
}

export function useContextMenu<T = unknown>() {
  const [state, setState] = useState<ContextMenuState | null>(null);

  const show = useCallback((e: React.MouseEvent, data?: T) => {
    e.preventDefault();
    e.stopPropagation();
    setState({ x: e.clientX, y: e.clientY, data });
  }, []);

  const close = useCallback(() => setState(null), []);

  return { open: !!state, x: state?.x ?? 0, y: state?.y ?? 0, data: state?.data as T | undefined, show, close };
}

interface ContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  children: React.ReactNode;
}

export function ContextMenu({ open, x, y, onClose, children }: ContextMenuProps) {
  useEffect(() => {
    if (!open) return;
    function onDown() { onClose(); }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    // Deferred so the click that opened the menu doesn't immediately close it.
    const t = setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      document.addEventListener("contextmenu", onDown);
    }, 0);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("contextmenu", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  // Clamp so the menu never renders off-screen near the right/bottom edge.
  const style = {
    left: Math.min(x, window.innerWidth - 200),
    top: Math.min(y, window.innerHeight - 220),
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.1 }}
          style={style}
          className="fixed z-[150] min-w-[11rem] rounded-2xl border border-card-border bg-white shadow-xl overflow-hidden py-1"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
