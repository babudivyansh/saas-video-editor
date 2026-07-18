"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "@/app/components/AuthContext";
import { assetsFetch } from "../lib/api";
import type { Asset, AssetListFilters } from "../types";

interface AssetsPage {
  assets: Asset[];
  nextCursor: string | null;
}

export function assetsQueryKey(filters: AssetListFilters) {
  return ["assets", "list", filters] as const;
}

function buildParams(filters: AssetListFilters, cursor?: string): URLSearchParams {
  const params = new URLSearchParams({ kind: filters.kind, sort: filters.sort });
  if (filters.q) params.set("q", filters.q);
  if (filters.folderId) params.set("folderId", filters.folderId);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.favorite) params.set("favorite", "true");
  if (filters.archived) params.set("archived", "true");
  if (cursor) params.set("cursor", cursor);
  return params;
}

/**
 * Cursor-paginated, cached, deduplicated asset listing — replaces the old
 * page's manual fetch/useState (which never sent the cursor the API already
 * supported, silently capping every user at their first 50 assets).
 */
export function useAssets(filters: AssetListFilters) {
  const { token, user } = useAuth();

  const query = useInfiniteQuery({
    queryKey: assetsQueryKey(filters),
    queryFn: ({ pageParam }) =>
      assetsFetch<AssetsPage>(`/api/assets?${buildParams(filters, pageParam ?? undefined)}`, token),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!user,
    staleTime: 30_000,
  });

  const assets = query.data?.pages.flatMap((p) => p.assets) ?? [];
  return { ...query, assets };
}
