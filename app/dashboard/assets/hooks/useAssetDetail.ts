"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/app/components/AuthContext";
import { assetsFetch } from "../lib/api";
import type { Asset } from "../types";
import type { AssetRelated } from "@/lib/related-content";

export interface AssetDetail {
  asset: Asset;
  related: AssetRelated;
}

export function assetDetailQueryKey(id: string) {
  return ["assets", "detail", id] as const;
}

/**
 * One asset plus its provenance graph.
 *
 * Until GET /api/assets/[id] existed there was no way to fetch a single asset
 * at all — the lightbox could only render a row that happened to be sitting in
 * an already-loaded page of the infinite list, which is why it couldn't be
 * deep-linked or opened from anywhere else.
 */
export function useAssetDetail(id: string | null) {
  const { user, token } = useAuth();

  return useQuery({
    queryKey: assetDetailQueryKey(id ?? ""),
    queryFn: () => assetsFetch<AssetDetail>(`/api/assets/${id}`, token),
    enabled: !!user && !!id,
    staleTime: 30_000,
  });
}
