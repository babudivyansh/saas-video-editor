"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/app/components/AuthContext";
import { assetsFetch } from "../lib/api";
import type { AssetStats } from "../types";

export const assetStatsQueryKey = ["assets", "stats"] as const;

export function useAssetStats() {
  const { token, user } = useAuth();
  return useQuery({
    queryKey: assetStatsQueryKey,
    queryFn: () => assetsFetch<AssetStats>("/api/assets?stats=true", token),
    enabled: !!user,
    staleTime: 15_000,
  });
}
