export interface VideoFile {
  file: File | null; // null when imported from YouTube/Instagram (no local File object)
  url: string;       // createObjectURL for local files; S3 URL for imports
  s3Url?: string;    // set after upload; used for HD server render
  duration: number;
  width: number;
  height: number;
  name: string;
}

export interface TrimRange {
  start: number; // seconds
  end: number;   // seconds
}

export interface TextOverlay {
  id: string;
  text: string;
  fontSize: "sm" | "md" | "lg";
  color: string;
  position: "top" | "center" | "bottom";
  bold: boolean;
  italic: boolean;
}

export interface Caption {
  id: string;
  startTime: number; // seconds
  endTime: number;   // seconds
  text: string;
}

export interface CropSettings {
  x: number;      // % from left (0–100)
  y: number;      // % from top (0–100)
  width: number;  // % of video width (0–100)
  height: number; // % of video height (0–100)
  aspectRatio: "16:9" | "9:16" | "1:1" | "4:5" | "free";
}

export interface EditorState {
  video: VideoFile | null;
  trim: TrimRange;
  crop: CropSettings | null;
  textOverlays: TextOverlay[];
  captions: Caption[];
  volume: number;        // 0–2 (1 = original)
  speed: number;         // 0.5–2 (1 = original)
  rotation: 0 | 90 | 180 | 270;
  activeToolPanel: string | null;
  projectName: string;
}

export interface HistoryEntry {
  state: EditorState;
  label: string;
}

export type ExportFormat = "mp4" | "webm";
export type ExportQuality = "480p" | "720p" | "1080p";
