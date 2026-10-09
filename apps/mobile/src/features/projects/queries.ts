import type { ClipListOptions, ProjectDetail, ProjectListOptions } from "@clipiro/shared";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { projects } from "@/lib/api";

// The Projects tab's data, from /api/mobile/v1/projects and /clips. Lists are
// paged (30 at a time) with search, sort and filters done by the server, so
// the counts and results cover everything, not just what's loaded.
export const projectKeys = {
  all: ["projects"] as const,
  list: (o: ProjectListOptions) => ["projects", "list", { q: o.q?.trim() ?? "", sort: o.sort ?? "recent", drafts: !!o.drafts }] as const,
  detail: (id: string) => ["projects", "detail", id] as const,
  clip: (id: string) => ["projects", "clip", id] as const,
  clips: (o: ClipListOptions) => ["projects", "clips", { aspect: o.aspect ?? null, favorites: !!o.favorites, q: o.q?.trim() ?? "" }] as const,
};

/** Still producing clips: the screen keeps asking until it isn't. */
const working = (p: ProjectDetail | undefined) =>
  !!p && (p.status === "processing" || p.status === "rendering" || p.clips.some((c) => c.status === "queued" || c.status === "rendering"));

export const POLL_MS = 5000;

/** Projects, a page at a time: `items` is everything loaded so far, `total` every match. */
export function useProjectList(o: ProjectListOptions = {}) {
  const q = useInfiniteQuery({
    queryKey: projectKeys.list(o),
    queryFn: ({ pageParam }) => projects.list({ ...o, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    // A new search or sort keeps the last results up until its answer lands.
    placeholderData: keepPreviousData,
  });
  return { ...q, items: q.data?.pages.flatMap((p) => p.projects) ?? [], total: q.data?.pages[0]?.total ?? 0 };
}

/** Clips across projects, a page at a time (the shape views). */
export function useClipList(o: ClipListOptions = {}) {
  const q = useInfiniteQuery({
    queryKey: projectKeys.clips(o),
    queryFn: ({ pageParam }) => projects.clips({ ...o, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    // A new search or sort keeps the last results up until its answer lands.
    placeholderData: keepPreviousData,
  });
  return { ...q, items: q.data?.pages.flatMap((p) => p.clips) ?? [], total: q.data?.pages[0]?.total ?? 0 };
}

export const useProject = (id: string) =>
  useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => projects.get(id),
    refetchInterval: (q) => (working(q.state.data) ? POLL_MS : false),
  });
/** One clip with its signed video link and the AI's reasoning. */
export const useClip = (id: string | null) =>
  useQuery({ queryKey: projectKeys.clip(id ?? ""), queryFn: () => projects.clip(id!), enabled: !!id, staleTime: 5 * 60 * 1000 });

/** Deletes in batches the server accepts (MAX_BULK); returns the totals. */
export async function deleteInBatches(ids: string[], remove: (batch: string[]) => Promise<{ deleted: number; skipped: number }>) {
  let deleted = 0;
  let skipped = 0;
  for (let i = 0; i < ids.length; i += 50) {
    const r = await remove(ids.slice(i, i + 50));
    deleted += r.deleted;
    skipped += r.skipped;
  }
  return { deleted, skipped };
}
