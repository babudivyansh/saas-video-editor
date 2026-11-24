// How AutoClip frames people in a vertical clip. Its own dependency-free
// module so client components can import the list without pulling in
// lib/reframe.ts (which builds the AWS Rekognition client at module scope).
//
//   auto        follow the scene: cuts for a conversation, a pan for one person
//   single      always one crop following the main face
//   split       two people stacked top and bottom. Without face tracking it
//               still works: the left half of the frame goes on top and the
//               right half below, which is how a two-camera podcast is shot
//   active      follow whoever is speaking
//   gaming      facecam on top (a third of the frame), gameplay below
//   gaming_pip  gameplay fills the frame, facecam as a picture-in-picture
//   fit         the whole frame, scaled to fit, over a blurred copy of itself
//
// gaming, gaming_pip and fit need NO face tracking: the facecam can be placed
// by hand (facecamBox) and fit has nothing to track at all.
export const SPEAKER_MODES = ["auto", "single", "split", "active", "gaming", "gaming_pip", "fit"] as const;
export type SpeakerMode = (typeof SPEAKER_MODES)[number];

/** A box on the source frame, as fractions of its width and height. */
export interface FacecamBox { x: number; y: number; w: number; h: number }

/**
 * Validates an untrusted facecam box. Returns null for anything missing or
 * malformed: a box outside the frame would put the crop outside it too, which
 * ffmpeg rejects after the user has already paid for the render.
 */
export function sanitizeFacecamBox(value: unknown): FacecamBox | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const n = (k: string) => (typeof v[k] === "number" && Number.isFinite(v[k]) ? (v[k] as number) : NaN);
  const x = n("x"), y = n("y"), w = n("w"), h = n("h");
  if ([x, y, w, h].some(Number.isNaN)) return null;
  if (w < 0.03 || h < 0.03 || w > 1 || h > 1) return null;
  if (x < 0 || y < 0 || x + w > 1 + 1e-6 || y + h > 1 + 1e-6) return null;
  const r = (k: number) => Math.round(k * 10_000) / 10_000;
  return { x: r(x), y: r(y), w: r(Math.min(w, 1 - x)), h: r(Math.min(h, 1 - y)) };
}

/** The layout templates each kind of video gets, in the order the picker shows them. */
export type VideoKind = "podcast" | "talking" | "gaming" | "vlog";

export interface LayoutTemplate {
  mode: SpeakerMode;
  label: string;
  hint: string;
  /** Works without face tracking. */
  noTracking: boolean;
}

const T: Record<SpeakerMode, LayoutTemplate> = {
  auto: { mode: "auto", label: "Smart", hint: "Cuts between speakers, pans on one, wide on a group", noTracking: false },
  single: { mode: "single", label: "Follow subject", hint: "One crop that follows the main face", noTracking: false },
  split: { mode: "split", label: "Split screen", hint: "Both speakers stacked, top and bottom", noTracking: true },
  active: { mode: "active", label: "Active speaker", hint: "Follows whoever is talking", noTracking: false },
  gaming: { mode: "gaming", label: "Facecam + gameplay", hint: "Webcam on top, gameplay fills the bottom two thirds", noTracking: true },
  gaming_pip: { mode: "gaming_pip", label: "Gameplay + cam", hint: "Gameplay fills the frame, webcam in a corner", noTracking: true },
  fit: { mode: "fit", label: "Full frame", hint: "The whole shot, nothing cropped, over a blurred fill", noTracking: true },
};

export const LAYOUT_TEMPLATES: Record<VideoKind, LayoutTemplate[]> = {
  podcast: [T.auto, T.split, T.fit],
  talking: [T.single, T.active, T.fit],
  gaming: [T.gaming, T.gaming_pip, T.fit],
  vlog: [T.single, T.auto, T.fit],
};

/** Every mode with its label, for surfaces that show them all. */
export const ALL_LAYOUT_TEMPLATES: LayoutTemplate[] = SPEAKER_MODES.map((m) => T[m]);

export function layoutTemplateFor(mode: SpeakerMode): LayoutTemplate {
  return T[mode] ?? T.auto;
}

/** Modes that place a facecam and can use a hand-placed box. */
export function usesFacecam(mode: SpeakerMode): boolean {
  return mode === "gaming" || mode === "gaming_pip";
}
