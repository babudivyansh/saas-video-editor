import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import { getPosts } from "@mocks/social";

export const socialKeys = { posts: ["social", "posts"] as const };
export const usePosts = () => useQuery({ queryKey: socialKeys.posts, queryFn: getPosts });

/** What the Composer opens with (from Calendar "+ Add", a clip's "Post", Export). */
export const useComposerSeed = create<{ date: string | null; clipId: string | null; seed: (s: { date?: string | null; clipId?: string | null }) => void }>((set) => ({
  date: null,
  clipId: null,
  seed: (s) => set({ date: s.date ?? null, clipId: s.clipId ?? null }),
}));

export const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
