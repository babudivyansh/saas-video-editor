"use client";

// One-line confirmations for the left panels ("Heading added at 0:04",
// "Glitch applied to the clip"). A module-level store so any panel can call
// showPanelToast() without prop-drilling; <PanelToaster/> renders the latest
// one over the bottom of the panel column, and the store clears it again
// after a moment.

import React, { useSyncExternalStore } from "react";

const SHOW_MS = 1800;
let current: { id: number; text: string } | null = null;
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showPanelToast(text: string) {
  current = { id: nextId++, text };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    current = null;
    emit();
  }, SHOW_MS);
  emit();
}

export function PanelToaster() {
  const toast = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
  if (!toast) return null;
  return (
    <div
      key={toast.id}
      role="status"
      className="editor-toast pointer-events-none absolute bottom-5 left-1/2 z-50 max-w-[90%] truncate whitespace-nowrap rounded-full bg-editor-accent px-3.5 py-2 text-[12px] font-bold text-editor-bg shadow-[0_8px_24px_rgba(32,214,138,0.35)]"
    >
      {toast.text}
    </div>
  );
}
