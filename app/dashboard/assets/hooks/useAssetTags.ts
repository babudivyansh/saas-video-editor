"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/app/components/AuthContext";
import { assetsFetch } from "../lib/api";
import type { Tag } from "../types";

export const assetTagsQueryKey = ["assets", "tags"] as const;

export function useAssetTags() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: assetTagsQueryKey,
    queryFn: () => assetsFetch<{ tags: Tag[] }>("/api/assets/tags", token),
    enabled: !!user,
    staleTime: 30_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: assetTagsQueryKey });

  const create = useMutation({
    mutationFn: (name: string) =>
      assetsFetch<{ tag: Tag }>("/api/assets/tags", token, { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: invalidate,
  });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      assetsFetch(`/api/assets/tags/${id}`, token, { method: "PATCH", body: JSON.stringify({ name }) }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => assetsFetch(`/api/assets/tags/${id}`, token, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["assets", "list"] });
    },
  });

  return { tags: query.data?.tags ?? [], isLoading: query.isLoading, create, rename, remove };
}
