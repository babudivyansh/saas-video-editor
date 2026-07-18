"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/app/components/AuthContext";
import { assetsFetch } from "../lib/api";
import type { AssetFolder } from "../types";

export const assetFoldersQueryKey = ["assets", "folders"] as const;

export function useAssetFolders() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: assetFoldersQueryKey,
    queryFn: () => assetsFetch<{ folders: AssetFolder[] }>("/api/assets/folders", token),
    enabled: !!user,
    staleTime: 30_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: assetFoldersQueryKey });

  const create = useMutation({
    mutationFn: (name: string) =>
      assetsFetch<{ folder: AssetFolder }>("/api/assets/folders", token, {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: invalidate,
  });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      assetsFetch(`/api/assets/folders/${id}`, token, { method: "PATCH", body: JSON.stringify({ name }) }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => assetsFetch(`/api/assets/folders/${id}`, token, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["assets", "list"] });
    },
  });

  return { folders: query.data?.folders ?? [], isLoading: query.isLoading, create, rename, remove };
}
