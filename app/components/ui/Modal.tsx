"use client";

// Accessible dialog primitive for the main dashboard design system (see
// DESIGN_SYSTEM.md) — focus trap, ESC to close, backdrop click, portaled to
// <body> so it never fights an ancestor's overflow/stacking context.

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: string; // Tailwind max-w-* class, default max-w-lg
  /**
   * "center" is the default dialog. "drawer" slides in from the right edge and
   * runs full height — for panels the user works *in* rather than a prompt they
   * answer and dismiss. Everything else (focus trap, ESC, scroll lock, focus
   * restore, portal) is identical, so a drawer is never a second-class dialog.
   */
  variant?: "center" | "drawer";
  /**
   * When set, a back arrow appears before the title. For dialogs that swap
   * between views in place rather than stacking a second dialog on top.
   */
  onBack?: () => void;
}

export function Modal({ open, onClose, title, children, maxWidth = "max-w-lg", variant = "center", onBack }: ModalProps) {
  const t = useTranslations("Common");
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  // Callers pass `onClose` as an inline arrow, so it is a new function on every
  // parent render. Depending on it directly made this effect tear down and
  // re-run constantly: re-stealing focus, and re-applying then restoring the
  // body scroll lock — which shifts layout as the scrollbar comes and goes, and
  // left the dialog never settling. Hold it in a ref so the effect keys only on
  // `open`.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement as HTMLElement;
    // Initial focus: first focusable control inside the dialog, so keyboard
    // users land on something actionable; the panel itself is the fallback.
    const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (firstFocusable ?? panelRef.current)?.focus();

    // Scroll-lock the page behind the dialog while it's open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { onCloseRef.current(); return; }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      lastFocused.current?.focus();
    };
  }, [open]);

  if (typeof document === "undefined") return null;

  const isDrawer = variant === "drawer";

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className={`fixed inset-0 z-[100] flex bg-black/70 backdrop-blur-sm ${
            isDrawer ? "justify-end" : "items-center justify-center p-4"
          }`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-label={title ? undefined : "Dialog"}
            tabIndex={-1}
            className={
              isDrawer
                ? `w-full ${maxWidth} h-full bg-panel shadow-xl border-l border-card-border outline-none overflow-y-auto`
                : `w-full ${maxWidth} bg-panel rounded-[var(--radius-card)] shadow-xl border border-card-border outline-none max-h-[90vh] overflow-y-auto`
            }
            initial={isDrawer ? { x: "100%" } : { opacity: 0, scale: 0.96, y: 8 }}
            animate={isDrawer ? { x: 0 } : { opacity: 1, scale: 1, y: 0 }}
            exit={isDrawer ? { x: "100%" } : { opacity: 0, scale: 0.96, y: 8 }}
            transition={isDrawer ? { type: "tween", duration: 0.25, ease: "easeOut" } : { duration: 0.18, ease: "easeOut" }}
          >
            {title && (
              <div className={`flex items-center justify-between px-5 py-4 border-b border-card-border ${
                isDrawer ? "sticky top-0 bg-panel z-10" : ""
              }`}>
                <div className="flex items-center gap-2 min-w-0">
                  {onBack && (
                    <button
                      onClick={onBack}
                      aria-label="Back"
                      className="w-7 h-7 -ml-1 rounded-full flex items-center justify-center text-ink-soft hover:bg-tint-blue hover:text-ink transition-colors cursor-pointer flex-shrink-0"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                        <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                  <h2 id={titleId} className="text-base font-bold text-ink truncate">{title}</h2>
                </div>
                <button
                  onClick={onClose}
                  aria-label={t("close")}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-ink-soft hover:bg-tint-blue hover:text-ink transition-colors cursor-pointer"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            )}
            <div className="p-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
