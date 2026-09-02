"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/app/components/AuthContext";

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
  failureReason: string | null;
  createdAt: string;
}

export type ClipSort = "date" | "oldest" | "score" | "duration";

export interface ClipFilters {
  q: string;
  status: string | null;
  sort: ClipSort;
  favorite: boolean;
}

interface ClipsPage {
  clips: ClipRow[];
  nextCursor: string | null;
}

class ClipsApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

async function clipsFetch<T>(path: string, token: string | null, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    // The old page called .json() and then read .projects off whatever came
    // back, so a 500 produced an empty list and rendered the "nothing here
    // yet" empty state — an error indistinguishable from having no content.
    throw new ClipsApiError(
      (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`,
      res.status,
    );
  }
  return data as T;
}

function buildParams(filters: ClipFilters, cursor?: string): URLSearchParams {
  const params = new URLSearchParams({ sort: filters.sort, limit: "30" });
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.favorite) params.set("favorite", "true");
  if (cursor) params.set("cursor", cursor);
  return params;
}

export function clipsQueryKey(filters: ClipFilters) {
  return ["clips", "list", filters] as const;
}

/** Cursor-paginated clips across every project the user owns. */
export function useClipsLibrary(filters: ClipFilters) {
  const { token, user, isLoading: authLoading } = useAuth();

  const query = useInfiniteQuery({
    queryKey: clipsQueryKey(filters),
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      clipsFetch<ClipsPage>(`/api/clips?${buildParams(filters, pageParam ?? undefined)}`, token),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: ClipsPage) => last.nextCursor ?? undefined,
    enabled: !!user,
    staleTime: 30_000,
  });

  const clips = query.data?.pages.flatMap((p) => p.clips) ?? [];

  // A disabled query reports isLoading:false, so while auth is still resolving
  // the caller would see "loaded, and empty" and render the no-clips-yet empty
  // state to a user who has plenty. Fold the auth wait into the loading flag —
  // this is the same "an unfinished request looks like no content" mistake the
  // old page made with its swallowed fetch errors.
  return { ...query, clips, isLoading: authLoading || (!!user && query.isLoading) };
}

/** Rename, star, and delete — none of which had a route before. */
export function useClipMutations() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["clips", "list"] });

  const rename = useMutation({
    mutationFn: ({ projectId, clipId, title }: { projectId: string; clipId: string; title: string }) =>
      clipsFetch(`/api/projects/${projectId}/clips/${clipId}`, token, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      }),
    onSuccess: invalidate,
  });

  const toggleFavorite = useMutation({
    mutationFn: ({
      projectId,
      clipId,
      isFavorite,
    }: {
      projectId: string;
      clipId: string;
      isFavorite: boolean;
    }) =>
      clipsFetch(`/api/projects/${projectId}/clips/${clipId}`, token, {
        method: "PATCH",
        body: JSON.stringify({ isFavorite }),
      }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: ({ projectId, clipId }: { projectId: string; clipId: string }) =>
      clipsFetch(`/api/projects/${projectId}/clips/${clipId}`, token, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  return { rename, toggleFavorite, remove };
}
