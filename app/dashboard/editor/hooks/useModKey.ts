"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** "⌘" on Apple devices, "Ctrl" elsewhere (and during server render). */
export function useModKey(): string {
  return useSyncExternalStore(
    noop,
    () => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}
