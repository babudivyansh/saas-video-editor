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

// Color-filter presets. Preview uses the css value; export uses the ffmpeg
// filter expression — both tuned to look as close as practical.
export const FILTER_PRESETS = {
  none: { label: "None", css: "none", ffmpeg: null },
  warm: { label: "Warm", css: "sepia(0.25) saturate(1.25)", ffmpeg: "colorbalance=rs=0.12:gs=0.02:bs=-0.12,eq=saturation=1.2" },
  cool: { label: "Cool", css: "saturate(1.1) hue-rotate(-8deg) brightness(1.02)", ffmpeg: "colorbalance=rs=-0.1:bs=0.12,eq=saturation=1.1:brightness=0.01" },
  mono: { label: "Mono", css: "grayscale(1) contrast(1.05)", ffmpeg: "hue=s=0,eq=contrast=1.05" },
  vivid: { label: "Vivid", css: "saturate(1.5) contrast(1.1)", ffmpeg: "eq=saturation=1.5:contrast=1.1" },
} as const;
export type FilterPreset = keyof typeof FILTER_PRESETS;

export const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4] as const;
export const MAX_FADE_SEC = 3;

export interface VideoClip extends ClipBase {
  type: "video";
  assetId: string; // Asset.id — server re-resolves the S3 key, never trusts URLs
  srcIn: number; // trim-in inside the source file, seconds
  volume: number; // 0..1
  muted: boolean;
  // Phase 2 fields — all optional so v1 docs stay valid.
  speed?: number; // playback rate 0.25..4 (default 1). Source consumed = duration * speed.
  fadeIn?: number; // fade-from-black seconds at clip start (0..MAX_FADE_SEC)
  fadeOut?: number; // fade-to-black seconds at clip end
  filter?: FilterPreset; // color preset (default "none")
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
    if (v.speed !== undefined && (typeof v.speed !== "number" || v.speed < 0.25 || v.speed > 4)) return "video clip invalid speed";
    if (v.fadeIn !== undefined && (!isFiniteNonNeg(v.fadeIn) || v.fadeIn > MAX_FADE_SEC)) return "video clip invalid fadeIn";
    if (v.fadeOut !== undefined && (!isFiniteNonNeg(v.fadeOut) || v.fadeOut > MAX_FADE_SEC)) return "video clip invalid fadeOut";
    if (v.filter !== undefined && !(v.filter in FILTER_PRESETS)) return "video clip invalid filter";
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
