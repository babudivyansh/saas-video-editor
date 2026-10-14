"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/app/components/AuthContext";

// Clip collections for the projects page (Stage 2) and the clips page's
// "Add to collection" (Stage 3). One query key, so a change anywhere refreshes
// every list that shows a collection or its count.

export interface CollectionRow {
  id: string;
  name: string;
  clipCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionsData {
  collections: CollectionRow[];
  favorites: { clipCount: number };
}

export const COLLECTIONS_KEY = ["clip-collections"] as const;
export const FAVORITES_ID = "favorites";

export function collectionHref(id: string): string {
  return `/dashboard/projects/collections/${id}`;
}

/** fetch with the session's Bearer token, throwing the API's own message on failure. */
export async function authedFetch<T>(token: string | null, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : `Request failed (${res.status})`);
  return body as T;
}

export function useCollections() {
  const { token, user } = useAuth();
  return useQuery({
    queryKey: COLLECTIONS_KEY,
    queryFn: () => authedFetch<CollectionsData>(token, "/api/clip-collections"),
    enabled: !!user,
    staleTime: 30_000,
  });
}

export function useCollectionMutations() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: COLLECTIONS_KEY });

  const create = useMutation({
    mutationFn: (name: string) =>
      authedFetch<{ collection: CollectionRow }>(token, "/api/clip-collections", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: refresh,
  });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      authedFetch(token, `/api/clip-collections/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => authedFetch(token, `/api/clip-collections/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const addClips = useMutation({
    mutationFn: ({ id, clipIds }: { id: string; clipIds: string[] }) =>
      authedFetch<{ added: number }>(token, `/api/clip-collections/${id}/clips`, {
        method: "POST",
        body: JSON.stringify({ clipIds }),
      }),
    onSuccess: (_d, v) => {
      void refresh();
      void qc.invalidateQueries({ queryKey: ["collection-clips", v.id] });
    },
  });
  const removeClips = useMutation({
    mutationFn: ({ id, clipIds }: { id: string; clipIds: string[] }) =>
      authedFetch<{ removed: number }>(token, `/api/clip-collections/${id}/clips`, {
        method: "DELETE",
        body: JSON.stringify({ clipIds }),
      }),
    onSuccess: (_d, v) => {
      void refresh();
      void qc.invalidateQueries({ queryKey: ["collection-clips", v.id] });
    },
  });

  return { create, rename, remove, addClips, removeClips };
}
