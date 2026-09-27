"use client";

// `xl` and up (1280px): wide enough for a library list AND its preview panel
// side by side. Below that the panel is hidden, so a row click has to do
// something else (open the clip / the lightbox) — which is why this is a JS
// check and not only a Tailwind class, same reasoning as useIsCompactEditor.

import { useSyncExternalStore } from "react";

const WIDE_QUERY = "(min-width: 1280px)";

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(WIDE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

export function useIsWideLayout(): boolean {
  // Server render (and hydration) assume narrow; the client corrects it on
  // mount without a setState-in-effect round trip.
  return useSyncExternalStore(subscribe, () => window.matchMedia(WIDE_QUERY).matches, () => false);
}
