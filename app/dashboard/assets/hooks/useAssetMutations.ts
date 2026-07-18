"use client";

import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useAuth } from "@/app/components/AuthContext";
import { assetsFetch, AssetApiError } from "../lib/api";
import type { Asset } from "../types";

interface AssetsPage {
  assets: Asset[];
  nextCursor: string | null;
}
type AssetsInfiniteData = InfiniteData<AssetsPage>;

const LIST_KEY = ["assets", "list"];
const STATS_KEY = ["assets", "stats"];

/** Applies `transform` to every cached asset-list page (every active filter
 * combination), used for optimistic updates that don't know which specific
 * filtered view(s) currently hold a given asset. */
function mapCachedAssets(
  queryClient: ReturnType<typeof useQueryClient>,
  transform: (assets: Asset[]) => Asset[],
): Array<[readonly unknown[], AssetsInfiniteData | undefined]> {
  const previous = queryClient.getQueriesData<AssetsInfiniteData>({ queryKey: LIST_KEY });
  queryClient.setQueriesData<AssetsInfiniteData>({ queryKey: LIST_KEY }, (data) => {
    if (!data) return data;
    return { ...data, pages: data.pages.map((p) => ({ ...p, assets: transform(p.assets) })) };
  });
  return previous;
}

function restoreCachedAssets(
  queryClient: ReturnType<typeof useQueryClient>,
  previous: Array<[readonly unknown[], AssetsInfiniteData | undefined]>,
) {
  for (const [key, data] of previous) queryClient.setQueryData(key, data);
}

export interface UseAssetMutationsOptions {
  onError?: (message: string) => void;
  onSuccess?: (message: string) => void;
}

export function useAssetMutations(opts: UseAssetMutationsOptions = {}) {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  function handleError(e: unknown, fallback: string) {
    const message = e instanceof AssetApiError ? e.message : fallback;
    opts.onError?.(message);
  }

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: LIST_KEY });
    queryClient.invalidateQueries({ queryKey: STATS_KEY });
  };

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      assetsFetch<{ asset: Asset }>(`/api/assets/${id}`, token, { method: "PATCH", body: JSON.stringify({ name }) }),
    onMutate: async ({ id, name }) => {
      await queryClient.cancelQueries({ queryKey: LIST_KEY });
      return { previous: mapCachedAssets(queryClient, (a) => a.map((x) => (x.id === id ? { ...x, name } : x))) };
    },
    onError: (e, _v, ctx) => { if (ctx) restoreCachedAssets(queryClient, ctx.previous); handleError(e, "Rename failed"); },
    onSuccess: () => opts.onSuccess?.("Renamed"),
  });

  const toggleFavorite = useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) =>
      assetsFetch<{ asset: Asset }>(`/api/assets/${id}`, token, { method: "PATCH", body: JSON.stringify({ isFavorite }) }),
    onMutate: async ({ id, isFavorite }) => {
      await queryClient.cancelQueries({ queryKey: LIST_KEY });
      return { previous: mapCachedAssets(queryClient, (a) => a.map((x) => (x.id === id ? { ...x, isFavorite } : x))) };
    },
    onError: (e, _v, ctx) => { if (ctx) restoreCachedAssets(queryClient, ctx.previous); handleError(e, "Failed to update favorite"); },
  });

  const move = useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) =>
      assetsFetch<{ asset: Asset }>(`/api/assets/${id}`, token, { method: "PATCH", body: JSON.stringify({ folderId }) }),
    onSuccess: () => { invalidateAll(); opts.onSuccess?.("Moved"); },
    onError: (e) => handleError(e, "Move failed"),
  });

  const setTags = useMutation({
    mutationFn: ({ id, tags }: { id: string; tags: string[] }) =>
      assetsFetch<{ asset: Asset }>(`/api/assets/${id}`, token, { method: "PATCH", body: JSON.stringify({ tags }) }),
    onSuccess: () => {
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ["assets", "tags"] });
    },
    onError: (e) => handleError(e, "Failed to update tags"),
  });

  const restore = useMutation({
    mutationFn: (id: string) =>
      assetsFetch<{ asset: Asset }>(`/api/assets/${id}`, token, { method: "PATCH", body: JSON.stringify({ restore: true }) }),
    onSuccess: () => { invalidateAll(); opts.onSuccess?.("Restored"); },
    onError: (e) => handleError(e, "Restore failed"),
  });

  // First call archives; the caller decides when to send a second call for a
  // permanently-archived item (the confirm-delete modal in the Archive view).
  const archiveOrDelete = useMutation({
    mutationFn: (id: string) => assetsFetch<{ status: string }>(`/api/assets/${id}`, token, { method: "DELETE" }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: LIST_KEY });
      return { previous: mapCachedAssets(queryClient, (a) => a.filter((x) => x.id !== id)) };
    },
    onError: (e, _v, ctx) => { if (ctx) restoreCachedAssets(queryClient, ctx.previous); handleError(e, "Delete failed"); },
    onSuccess: (res) => {
      invalidateAll();
      opts.onSuccess?.(res.status === "archived" ? "Moved to Archive" : "Permanently deleted");
    },
  });

  type BulkAction = "archive" | "restore" | "permanentDelete" | "move" | "tag" | "favorite" | "unfavorite" | "download";
  const bulk = useMutation({
    mutationFn: (body: { action: BulkAction; ids: string[]; folderId?: string | null; tags?: string[] }) =>
      assetsFetch<{ updated?: number; deleted?: number; jobId?: string }>("/api/assets/bulk", token, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (res, vars) => {
      invalidateAll();
      if (vars.action === "download") return; // caller polls the returned jobId separately
      const n = res.updated ?? res.deleted ?? vars.ids.length;
      const verb = { archive: "archived", restore: "restored", permanentDelete: "permanently deleted", move: "moved", tag: "tagged", favorite: "favorited", unfavorite: "unfavorited" }[vars.action];
      opts.onSuccess?.(`${n} asset${n === 1 ? "" : "s"} ${verb}`);
    },
    onError: (e) => handleError(e, "Bulk action failed"),
  });

  return { rename, toggleFavorite, move, setTags, restore, archiveOrDelete, bulk };
}
