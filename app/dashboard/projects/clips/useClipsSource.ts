"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/app/dashboard/create/auto-clip/_components/shared";
import { autoClipPollIntervalMs } from "@/app/dashboard/create/auto-clip/_components/ClipsResults";
import { COLLECTIONS_KEY } from "../hooks/useCollections";
import type { ClipsSource, CollectionClipsResponse, ProjectClipsResponse, ViewClip } from "./model";

// Loads the clips page's clips — a project's (polled while the run is live,
// exactly as the AutoClip results page polls) or a collection's — and the
// per-clip writes that change them: heart, thumbs-down, duplicate.

export function clipsQueryKey(source: ClipsSource) {
  return source.kind === "project" ? ["project-clips", source.id] : ["collection-clips", source.id];
}

type Data = ProjectClipsResponse | CollectionClipsResponse;

export function useClipsSource(source: ClipsSource) {
  const qc = useQueryClient();
  const key = clipsQueryKey(source);

  const query = useQuery<Data>({
    queryKey: key,
    queryFn: () =>
      apiFetch<Data>(
        source.kind === "project"
          ? `/api/projects/${source.id}/clips?excerpts=1`
          : `/api/clip-collections/${source.id}/clips?excerpts=1`,
      ),
    refetchInterval: (q) =>
      source.kind === "project"
        ? autoClipPollIntervalMs(q.state.data as ProjectClipsResponse | undefined, q.state.error)
        : false,
    // A 404 (deleted project or collection) won't appear by asking again.
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
  });

  const patchLocal = (clipId: string, patch: Partial<ViewClip>) =>
    qc.setQueryData<Data>(key, (d) => (d ? { ...d, clips: d.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)) } : d));

  /** Heart or thumbs-down, optimistic; the server clears the other one. */
  async function setFeedback(clip: ViewClip, field: "isFavorite" | "isDisliked", value: boolean) {
    const before = { isFavorite: clip.isFavorite, isDisliked: clip.isDisliked };
    const next =
      field === "isFavorite"
        ? { isFavorite: value, ...(value ? { isDisliked: false } : {}) }
        : { isDisliked: value, ...(value ? { isFavorite: false } : {}) };
    patchLocal(clip.id, next);
    try {
      await apiFetch(`/api/projects/${clip.projectId}/clips/${clip.id}`, {
        method: "PATCH",
        body: JSON.stringify({ [field]: value }),
      });
      // Favorites' count and list live elsewhere. On the Favorites page itself
      // an un-hearted clip stays put until the next load, so it can be undone.
      void qc.invalidateQueries({ queryKey: COLLECTIONS_KEY });
      if (!(source.kind === "collection" && source.id === "favorites")) {
        void qc.invalidateQueries({ queryKey: ["collection-clips", "favorites"] });
      }
    } catch (e) {
      patchLocal(clip.id, before);
      throw e;
    }
  }

  async function duplicate(clip: ViewClip) {
    const res = await apiFetch<{ clip: { id: string } }>(`/api/projects/${clip.projectId}/clips/${clip.id}/duplicate`, { method: "POST" });
    await query.refetch();
    void qc.invalidateQueries({ queryKey: ["project-clips", clip.projectId] });
    return res.clip;
  }

  return { query, setFeedback, duplicate, refetch: () => query.refetch() };
}
