// One row of GET /api/clips — the clip lists on Home and in global search.

export interface ClipRow {
  id: string;
  projectId: string;
  projectTitle: string;
  projectStatus: string;
  index: number;
  title: string | null;
  score: number | null;
  status: string;
  progress: number;
  isFavorite: boolean;
  durationSec: number;
  startSec: number;
  endSec: number;
  aspectRatio: string;
  thumbnailUrl: string | null;
  /** Signed, and only present once the clip has finished rendering. */
  videoUrl: string | null;
  failureReason: string | null;
  createdAt: string;
}

