import type { ClipItem, ProjectMeta } from "@/app/dashboard/create/auto-clip/_components/shared";
import { matchesFilters, type ClipFilters } from "@/lib/clip-view";

// The clips page's data model: a project's clips or a collection's, in the
// shape GET /api/projects/[id]/clips and GET /api/clip-collections/[id]/clips
// both return (lib/clip-view-query.ts).

export interface ViewClip extends ClipItem {
  projectId: string;
  projectTitle: string;
  isFavorite: boolean;
  isDisliked: boolean;
  dubbed: boolean;
  edited: boolean;
  transcriptExcerpt?: string | null;
}

export interface ProjectClipsResponse {
  project: ProjectMeta & { title: string; instructions: string | null; progress: number };
  clips: ViewClip[];
}

export interface CollectionClipsResponse {
  collection: { id: string; name: string; builtIn: boolean };
  clips: ViewClip[];
}

export type ClipsSource = { kind: "project"; id: string } | { kind: "collection"; id: string };

export type ClipSort = "score" | "order" | "duration" | "added";
export type ClipLayout = "list" | "grid";

export const SORT_LABELS: Record<ClipSort, string> = {
  score: "Best first",
  order: "Order in video",
  duration: "Longest first",
  added: "Recently added",
};

/** Sorts a copy; "added" keeps the API's order (newest addition first). */
export function sortClips(clips: ViewClip[], sort: ClipSort): ViewClip[] {
  if (sort === "added") return clips.slice();
  return clips.slice().sort((a, b) => {
    if (sort === "order") return a.projectId === b.projectId ? a.index - b.index : a.startSec - b.startSec;
    if (sort === "duration") return b.durationSec - a.durationSec;
    return (b.score ?? -1) - (a.score ?? -1) || a.index - b.index;
  });
}

export function visibleClips(clips: ViewClip[], filters: ClipFilters, sort: ClipSort): ViewClip[] {
  return sortClips(clips.filter((c) => matchesFilters(c, filters)), sort);
}

export function clipName(c: Pick<ClipItem, "title" | "index">): string {
  return c.title?.trim() || `Clip ${c.index + 1}`;
}

/** "[04:46 - 05:54]" — the clip's window in the source video. */
export function clipWindow(c: Pick<ClipItem, "startSec" | "endSec">): string {
  const t = (s: number) => {
    const v = Math.max(0, Math.round(s));
    const h = Math.floor(v / 3600);
    const m = String(Math.floor((v % 3600) / 60)).padStart(2, "0");
    const sec = String(v % 60).padStart(2, "0");
    return h > 0 ? `${h}:${m}:${sec}` : `${m}:${sec}`;
  };
  return `${t(c.startSec)} - ${t(c.endSec)}`;
}

/** The step from `id` to the previous/next clip in `list`, wrapping. */
export function stepClip(list: { id: string }[], id: string, delta: 1 | -1): string | null {
  const i = list.findIndex((c) => c.id === id);
  if (i < 0 || list.length === 0) return null;
  return list[(i + delta + list.length) % list.length].id;
}

export const isReady = (c: ClipItem) => c.status === "ready" && !!c.videoUrl;
