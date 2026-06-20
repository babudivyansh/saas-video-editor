// Shared edit-document types for the Simple and Advanced editors. The SAME object
// drives the live client preview and the server-side ffmpeg render, guaranteeing
// preview/export parity.

import type { Aspect } from "./crop";
import type { WordTiming } from "@/utils/elevenlabs";

export type { WordTiming } from "@/utils/elevenlabs";

export type CaptionMode = "oneword" | "lines";

export interface CaptionState {
  enabled: boolean;
  styleIndex: number;      // index into styleIndexToSubtitleStyle (0–15)
  mode: CaptionMode;
  segments: WordTiming[];  // word-level timings (ms), editable text
}

// Position values (x, y) are fractions 0..1 of the output frame (top-left origin),
// so overlays stay correct across aspects. Times are in seconds.
export interface TextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  start: number;
  end: number;
  fontSize: number;   // px relative to the output width's 1080 baseline
  color: string;      // hex, e.g. "#ffffff"
}

export interface ImageOverlay {
  id: string;
  url: string;
  x: number;
  y: number;
  w: number;          // fraction of frame width 0..1
  start: number;
  end: number;
}

export interface MusicTrack {
  url: string;
  volume: number;     // 0..1
}

export interface EditorDoc {
  videoUrl: string;
  durationSec: number;
  aspect: Aspect;
  trimStart: number;  // seconds
  trimEnd: number;    // seconds
  captions: CaptionState;
  music?: MusicTrack;
  textOverlays: TextOverlay[];
  imageOverlays: ImageOverlay[];
}

export function emptyDoc(videoUrl: string, durationSec: number): EditorDoc {
  return {
    videoUrl,
    durationSec,
    aspect: "9:16",
    trimStart: 0,
    trimEnd: durationSec,
    captions: { enabled: true, styleIndex: 0, mode: "oneword", segments: [] },
    textOverlays: [],
    imageOverlays: [],
  };
}
