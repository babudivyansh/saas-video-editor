"use client";

// Below `xl` (1280px) — but above the phone-width gate in EditorShell.tsx,
// which already blocks <768px entirely — the side panels don't have room to
// sit inline next to the preview (SidebarTabs' expanded panel + PropertiesPanel
// alone are 608px). This hook lets those two panels switch from pushing the
// preview aside to overlaying on top of it, closed by default, on tablets.
//
// Deliberately `xl`, not `lg` (1024px): iPad Mini/Air land at 1024-1194px
// wide in landscape, so `lg` showed the cramped inline layout on those
// tablets instead of the overlay treatment meant for anything non-desktop.
//
// The only JS-driven breakpoint check in the app (everywhere else uses pure
// Tailwind classes) — justified here because the panels' open/closed state is
// already interactive React state, not purely presentational, so a CSS media
// query alone can't drive their default.

import { useEffect, useState } from "react";

const COMPACT_QUERY = "(max-width: 1279px)";

export function useIsCompactEditor(): boolean {
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(COMPACT_QUERY);
    setIsCompact(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setIsCompact(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isCompact;
}
