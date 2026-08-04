"use client";

// Pointer + keyboard cursor for an SVG plot.
//
// FIXES A REAL BUG. The previous LineChart drove its crosshair from onMouseMove
// alone, so on touch there was no way to read any value — the primary content of
// the page was decoration on mobile, on a product whose e2e suite includes a
// Mobile Safari project. Keyboard users had nothing either.
//
// Pointer events cover mouse, touch and pen in one path. touch-action: pan-y
// (applied by the consumer) keeps vertical page scrolling working while the
// chart claims horizontal movement.

import { useCallback, useMemo, useState, type RefObject } from "react";

export interface CursorState {
  /** Index of the focused point, or null when nothing is focused. */
  index: number | null;
  /** True when pinned by a tap/click rather than transient hover. */
  pinned: boolean;
}

export interface UseChartCursor {
  index: number | null;
  pinned: boolean;
  /** Spread onto the <svg>. */
  handlers: {
    onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
    onPointerLeave: () => void;
    onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void;
    onKeyDown: (e: React.KeyboardEvent<SVGSVGElement>) => void;
    onBlur: () => void;
    tabIndex: number;
    role: "application";
    "aria-roledescription": string;
  };
  clear: () => void;
}

/**
 * The SVG ref is OWNED BY THE CALLER rather than returned from here. Bundling a
 * ref into the returned object made every read of `cursor.index` look like a ref
 * access during render to the react-hooks/refs lint rule, which is a hard error
 * in this repo's config. Taking it as a parameter keeps the boundary honest: the
 * hook reads the element only inside event handlers.
 */
export function useChartCursor(
  svgRef: RefObject<SVGSVGElement | null>,
  pointCount: number,
  opts: { plotLeft: number; plotWidth: number; onSelect?: (index: number) => void },
): UseChartCursor {
  const [state, setState] = useState<CursorState>({ index: null, pinned: false });

  /**
   * Map a client x to a point index. Goes through the SVG's own viewBox scaling
   * rather than assuming CSS pixels, so the cursor stays aligned when the chart
   * is responsive — which it always is.
   */
  const indexFromClientX = useCallback(
    (clientX: number): number | null => {
      const svg = svgRef.current;
      if (!svg || pointCount === 0) return null;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0) return null;

      const viewBox = svg.viewBox.baseVal;
      const scale = viewBox && viewBox.width > 0 ? viewBox.width / rect.width : 1;
      const x = (clientX - rect.left) * scale;

      if (pointCount === 1) return 0;
      const step = opts.plotWidth / (pointCount - 1);
      const raw = Math.round((x - opts.plotLeft) / step);
      return Math.max(0, Math.min(pointCount - 1, raw));
    },
    [svgRef, pointCount, opts.plotLeft, opts.plotWidth],
  );

  const clear = useCallback(() => setState({ index: null, pinned: false }), []);

  const handlers = useMemo(
    () => ({
      tabIndex: 0,
      role: "application" as const,
      "aria-roledescription": "interactive chart",

      onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => {
        // A pinned cursor survives hover, so a tapped tooltip does not vanish
        // when the finger moves.
        if (state.pinned) return;
        const index = indexFromClientX(e.clientX);
        if (index !== null) setState({ index, pinned: false });
      },

      onPointerLeave: () => {
        if (!state.pinned) clear();
      },

      onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => {
        const index = indexFromClientX(e.clientX);
        if (index === null) return;
        // Tapping the pinned point again releases it; tapping elsewhere moves it.
        const samePoint = state.pinned && state.index === index;
        setState({ index: samePoint ? null : index, pinned: !samePoint });
        if (!samePoint) opts.onSelect?.(index);
      },

      onKeyDown: (e: React.KeyboardEvent<SVGSVGElement>) => {
        if (pointCount === 0) return;
        const current = state.index ?? pointCount - 1;
        let next: number | null = null;

        switch (e.key) {
          case "ArrowLeft": next = Math.max(0, current - 1); break;
          case "ArrowRight": next = Math.min(pointCount - 1, current + 1); break;
          case "Home": next = 0; break;
          case "End": next = pointCount - 1; break;
          case "Escape": clear(); e.preventDefault(); return;
          case "Enter":
          case " ":
            if (state.index !== null) opts.onSelect?.(state.index);
            e.preventDefault();
            return;
          default:
            return;
        }

        // Only prevent default for keys we actually consumed, so Tab still moves
        // focus out of the chart.
        e.preventDefault();
        setState({ index: next, pinned: true });
      },

      onBlur: clear,
    }),
    [state.pinned, state.index, indexFromClientX, clear, pointCount, opts],
  );

  return { index: state.index, pinned: state.pinned, handlers, clear };
}
