// How AutoClip's camera zooms. Its own dependency-free module so client
// components (the AutoClip panel, the clip workspace) can import the list.
//
//   jump    snap tighter or back to wide on a new sentence or an emphasised
//           word — the cut-zoom style of most short-form edits. The default
//           for new runs since 2026-11-21.
//   smooth  the energy-reactive push-ins (lib/camera-motion.ts). What every
//           clip made before 2026-11-21 used, so a stored clip without a
//           zoomStyle keeps it on re-render.
export const ZOOM_STYLES = ["jump", "smooth"] as const;
export type ZoomStyle = (typeof ZOOM_STYLES)[number];

/** What a new run gets when the request doesn't say. */
export const DEFAULT_ZOOM_STYLE: ZoomStyle = "jump";

/** A stored clip's style. Missing = made before the setting existed = smooth. */
export function storedZoomStyle(value: unknown): ZoomStyle {
  return value === "jump" ? "jump" : "smooth";
}
