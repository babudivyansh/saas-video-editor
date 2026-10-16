"use client";

// Below `md` (768px) the editor switches to its phone layout: a bottom tool
// bar instead of the left rail, and panels that open full screen. Like
// useIsCompactEditor, JS-driven because the layout swaps components, not just
// styles.

import { useSyncExternalStore } from "react";

const PHONE_QUERY = "(max-width: 767px)";

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(PHONE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

export function useIsPhoneEditor(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}
