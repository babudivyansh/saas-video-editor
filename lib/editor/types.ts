// TimelineDoc: the single JSON document that describes an editor project.
// Stored in Project.editorDoc, edited by the Zustand store on the client, and
// re-validated server-side before rendering. Keep this file dependency-free —
// it is imported by both client components and the render job.

export type Aspect = "9:16" | "1:1" | "16:9";

export const ASPECT_DIMENSIONS: Record<Aspect, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "16:9": { w: 1920, h: 1080 },
};

// Fonts available in the text panel. Client previews with the same family the
// server burns in, so the whitelist is the parity contract between the two.
export const FONT_WHITELIST = ["Arial", "Impact", "Times New Roman"] as const;
export type FontFamily = (typeof FONT_WHITELIST)[number];

export interface ClipBase {
  id: string; // uuid
  timelineStart: number; // seconds on the timeline
  duration: number; // seconds on the timeline
}

export interface VideoClip extends ClipBase {
  type: "video";
  assetId: string; // Asset.id — server re-resolves the S3 key, never trusts URLs
  srcIn: number; // trim-in inside the source file, seconds (1x speed: srcOut = srcIn + duration)
  volume: number; // 0..1
  muted: boolean;
}

export interface TextClip extends ClipBase {
  type: "text";
  text: string;
  fontFamily: FontFamily;
  fontSizePct: number; // % of canvas HEIGHT (0..1) — resolution independent
  color: string; // #rrggbb
  bold: boolean;
  align: "left" | "center" | "right";
  x: number; // 0..1 normalized center position
  y: number; // 0..1 normalized center position
  bgColor: string | null; // optional pill background behind the text
}

export interface AudioClip extends ClipBase {
  type: "audio";
  assetId: string;
  srcIn: number;
  volume: number; // 0..1
}

export type AnyClip = VideoClip | TextClip | AudioClip;
export type TrackKind = "video" | "text" | "audio";

export interface TimelineDoc {
  version: 1;
  aspect: Aspect;
  fps: 30;
  tracks: {
    video: VideoClip[]; // sorted by timelineStart, non-overlapping
    text: TextClip[];
    audio: AudioClip[];
  };
}

export const DEFAULT_DOC: TimelineDoc = {
  version: 1,
  aspect: "9:16",
  fps: 30,
  tracks: { video: [], text: [], audio: [] },
};

export const MIN_CLIP_DURATION = 0.05; // seconds
export const MAX_CLIPS_PER_TRACK = 50;
export const MAX_DOC_BYTES = 200_000;

// ── Validation (shared client/server; server calls this before rendering) ──

function isFiniteNonNeg(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

function validateBase(c: ClipBase): string | null {
  if (typeof c.id !== "string" || !c.id) return "clip missing id";
  if (!isFiniteNonNeg(c.timelineStart)) return "invalid timelineStart";
  if (!isFiniteNonNeg(c.duration) || c.duration < MIN_CLIP_DURATION) return "invalid duration";
  return null;
}

/** Returns null if valid, otherwise a human-readable error string. */
export function validateDoc(doc: unknown): string | null {
  if (!doc || typeof doc !== "object") return "doc is not an object";
  const d = doc as TimelineDoc;
  if (d.version !== 1) return "unsupported version";
  if (!ASPECT_DIMENSIONS[d.aspect]) return "invalid aspect";
  if (!d.tracks || typeof d.tracks !== "object") return "missing tracks";

  for (const kind of ["video", "text", "audio"] as const) {
    const track = d.tracks[kind];
    if (!Array.isArray(track)) return `track ${kind} is not an array`;
    if (track.length > MAX_CLIPS_PER_TRACK) return `too many clips on ${kind} track`;
    for (const clip of track) {
      const baseErr = validateBase(clip);
      if (baseErr) return `${kind}: ${baseErr}`;
      if (clip.type !== kind) return `${kind}: wrong clip type`;
    }
  }

  // Video track must be sorted and non-overlapping (small float tolerance).
  const vids = d.tracks.video;
  for (let i = 1; i < vids.length; i++) {
    const prevEnd = vids[i - 1].timelineStart + vids[i - 1].duration;
    if (vids[i].timelineStart < prevEnd - 0.001) return "video clips overlap or are unsorted";
  }

  for (const v of d.tracks.video) {
    if (typeof v.assetId !== "string" || !v.assetId) return "video clip missing assetId";
    if (!isFiniteNonNeg(v.srcIn)) return "video clip invalid srcIn";
    if (typeof v.volume !== "number" || v.volume < 0 || v.volume > 1) return "video clip invalid volume";
  }
  for (const t of d.tracks.text) {
    if (typeof t.text !== "string") return "text clip missing text";
    if (!FONT_WHITELIST.includes(t.fontFamily)) return "text clip font not allowed";
    if (typeof t.fontSizePct !== "number" || t.fontSizePct <= 0 || t.fontSizePct > 0.5) return "text clip invalid fontSizePct";
    if (!/^#[0-9a-fA-F]{6}$/.test(t.color)) return "text clip invalid color";
    if (t.bgColor !== null && !/^#[0-9a-fA-F]{6}$/.test(t.bgColor)) return "text clip invalid bgColor";
    if (typeof t.x !== "number" || t.x < 0 || t.x > 1 || typeof t.y !== "number" || t.y < 0 || t.y > 1)
      return "text clip invalid position";
  }
  for (const a of d.tracks.audio) {
    if (typeof a.assetId !== "string" || !a.assetId) return "audio clip missing assetId";
    if (!isFiniteNonNeg(a.srcIn)) return "audio clip invalid srcIn";
    if (typeof a.volume !== "number" || a.volume < 0 || a.volume > 1) return "audio clip invalid volume";
  }

  if (JSON.stringify(doc).length > MAX_DOC_BYTES) return "doc too large";
  return null;
}
