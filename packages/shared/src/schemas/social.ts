import { z } from "zod";
import { providerSchema } from "./insights";

// Social Studio: scheduled posts and the composer. Posting itself is Phase 11
// (backend designed in docs/mobile/SCHEDULING.md, pending approval); these
// shapes are what that API returns.

/** Where a post can go. v1 posts to YouTube Shorts only; the rest are "Soon". */
export const POST_TARGETS = [
  { id: "youtube", label: "YouTube Shorts", available: true },
  { id: "instagram", label: "Reels", available: false },
  { id: "facebook", label: "Facebook", available: false },
] as const;
export type PostTarget = (typeof POST_TARGETS)[number]["id"];

/** Caption limit: Instagram's 2,200 (the tightest of the three). */
export const CAPTION_MAX = 2200;
export const MAX_HASHTAGS = 15;

export const scheduledPostSchema = z.object({
  id: z.string(),
  clipId: z.string(),
  title: z.string(),
  thumbnailUrl: z.string(),
  provider: providerSchema,
  caption: z.string(),
  hashtags: z.array(z.string()),
  scheduledAt: z.string(),
  status: z.enum(["scheduled", "posted", "failed"]),
  failureReason: z.string().nullable(),
});
export type ScheduledPost = z.infer<typeof scheduledPostSchema>;

export const composeRequest = z
  .object({
    clipId: z.string().min(1, "Choose a clip"),
    targets: z.array(z.enum(["youtube", "instagram", "facebook"])).min(1, "Pick where to post"),
    caption: z.string().max(CAPTION_MAX, `Keep it under ${CAPTION_MAX.toLocaleString("en-US")} characters`),
    hashtags: z.array(z.string().regex(/^#[\p{L}\p{N}_]{1,60}$/u, "Hashtags are # plus letters, numbers or _")).max(MAX_HASHTAGS),
    when: z.enum(["now", "schedule"]),
    scheduledAt: z.string().nullable(),
  })
  .refine((r) => r.when === "now" || (r.scheduledAt != null && new Date(r.scheduledAt).getTime() > Date.now() + 60_000), {
    message: "Pick a time in the future",
    path: ["scheduledAt"],
  });
export type ComposeRequest = z.infer<typeof composeRequest>;

/** "#Founders, startup" → ["#founders", "#startup"], de-duplicated. */
export function parseHashtags(raw: string): string[] {
  const tags = raw
    .split(/[\s,]+/)
    .map((t) => t.trim().replace(/^#*/, ""))
    .filter(Boolean)
    .map((t) => `#${t.toLowerCase()}`);
  return [...new Set(tags)];
}

/** Days of a month as a Monday-first grid, nulls for the leading blanks. */
export function monthGrid(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1).getDay(); // 0 = Sunday
  const lead = (first + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  return [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
}
