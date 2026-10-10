import { POST_PLATFORMS, type PostStatus, type SocialPost } from "@clipiro/shared";
import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import type { StatusTone } from "@/components/StatusBadge";
import { social } from "@/lib/api";
import { isUpsell } from "../insights/queries";

// The Social Studio's posts from /api/mobile/v1/social/posts (mobile Phase
// 11.3, lib/mobile/posts.ts). Subscriber-only, like Insights.

export const socialKeys = {
  posts: ["social", "posts"] as const,
  post: (id: string) => ["social", "post", id] as const,
};

/** Every post with its time in [from, to] (the API's default window when omitted), following the cursor. */
async function allPosts(from?: string, to?: string): Promise<SocialPost[]> {
  const out: SocialPost[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 10; page++) {
    const r = await social.posts({ from, to, cursor });
    out.push(...r.posts);
    if (!r.nextCursor) break;
    cursor = r.nextCursor;
  }
  return out;
}

const posting = (posts: SocialPost[] | undefined) => posts?.some((p) => p.status === "posting");

/** Posts in a window; refreshes every 15 s while one is uploading. */
export const usePosts = (range?: { from: string; to: string }) =>
  useQuery({
    queryKey: [...socialKeys.posts, range?.from ?? null, range?.to ?? null],
    queryFn: () => allPosts(range?.from, range?.to),
    retry: (n, e) => !isUpsell(e) && n < 2,
    refetchInterval: (q) => (posting(q.state.data) ? 15_000 : false),
  });

export const usePost = (id: string | null) =>
  useQuery({ queryKey: socialKeys.post(id ?? ""), queryFn: () => social.post(id!).then((r) => r.post), enabled: !!id, retry: (n, e) => !isUpsell(e) && n < 2 });

/** What the Composer opens with: a day (Calendar "+ Add"), a clip (its "Post"), an Assets video (Export → Post), or a scheduled post to edit. */
type Seed = { date: string | null; clipId: string | null; assetId: string | null; editId: string | null };
export const useComposerSeed = create<Seed & { seed: (s: Partial<Seed>) => void }>((set) => ({
  date: null,
  clipId: null,
  assetId: null,
  editId: null,
  seed: (s) => set({ date: s.date ?? null, clipId: s.clipId ?? null, assetId: s.assetId ?? null, editId: s.editId ?? null }),
}));

export const STATUS: Record<PostStatus, { label: string; tone: StatusTone }> = {
  scheduled: { label: "Scheduled", tone: "success" },
  posting: { label: "Posting", tone: "info" },
  posted: { label: "Posted", tone: "info" },
  failed: { label: "Failed", tone: "error" },
  your_turn: { label: "Your turn", tone: "warning" },
  missed: { label: "Missed", tone: "error" },
};

export const platformLabel = (provider: string) => POST_PLATFORMS.find((p) => p.id === provider)?.label ?? provider;

export const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
export const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
