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

// ── Posts API (/api/mobile/v1/social/posts, mobile Phase 11.3) ───────────────
// docs/mobile/SCHEDULING.md. scheduledPostSchema / composeRequest above are
// the design-time shapes the app's mocks still use until Phase 11.4.

/** What the app shows for a post. "your_turn": an Instagram/Facebook post the person posts themselves, then links. */
export const POST_STATUSES = ["scheduled", "posting", "posted", "failed", "your_turn", "missed"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];
export const POST_PRIVACY = ["public", "unlisted", "private"] as const;
export type PostPrivacy = (typeof POST_PRIVACY)[number];

/** YouTube's limits; Instagram and Facebook captions stop at CAPTION_MAX. */
export const POST_TITLE_MAX = 100;
export const POST_CAPTION_MAX = 5000;
export const POST_HASHTAGS_MAX = 30;
/** A scheduled time must be this far ahead, and no further than POST_MAX_DAYS. */
export const POST_MIN_LEAD_MIN = 5;
export const POST_MAX_DAYS = 90;

const hashtag = z.string().regex(/^#[\p{L}\p{N}_]{1,60}$/u, "Hashtags are # plus letters, numbers or _");

export const socialPostSchema = z.object({
  id: z.string(),
  /** The video: a clip, or a video from Assets (null once that video is deleted). */
  clipId: z.string().nullable(),
  assetId: z.string().nullable(),
  title: z.string(),
  thumbnailUrl: z.string().nullable(),
  account: z.object({ id: z.string(), provider: providerSchema, name: z.string() }),
  caption: z.string(),
  hashtags: z.array(z.string()),
  privacy: z.enum(POST_PRIVACY),
  status: z.enum(POST_STATUSES),
  /** When it goes (or went) out; null for an old web post that was never scheduled. */
  scheduledAt: z.string().nullable(),
  publishedAt: z.string().nullable(),
  permalink: z.string().nullable(),
  failureReason: z.string().nullable(),
  /** Title, caption and time can still change (a scheduled post that hasn't started). */
  editable: z.boolean(),
});
export type SocialPost = z.infer<typeof socialPostSchema>;

export const postsResponse = z.object({ posts: z.array(socialPostSchema), nextCursor: z.string().nullable() });
export const postResponse = z.object({ post: socialPostSchema });

/** "not_short": YouTube will post it as a regular video (over 3 min, or not vertical). "uploads_busy": today's YouTube uploads are used up, so it goes out when they free up. */
export const POST_WARNINGS = ["not_short", "uploads_busy"] as const;
export const createPostsResponse = z.object({ posts: z.array(socialPostSchema), warnings: z.array(z.enum(POST_WARNINGS)) });

export const createPostsRequest = z.object({
  source: z.union([z.object({ clipId: z.string().min(1) }).strict(), z.object({ assetId: z.string().min(1) }).strict()]),
  accountIds: z.array(z.string().min(1)).min(1, "Pick where to post").max(10),
  title: z.string().trim().max(POST_TITLE_MAX, `Keep the title under ${POST_TITLE_MAX} characters`).optional(),
  caption: z.string().max(POST_CAPTION_MAX, `Keep it under ${POST_CAPTION_MAX.toLocaleString("en-US")} characters`).default(""),
  hashtags: z.array(hashtag).max(POST_HASHTAGS_MAX, `Up to ${POST_HASHTAGS_MAX} hashtags`).default([]),
  privacy: z.enum(POST_PRIVACY).default("public"),
  /** "now", or an ISO time at least POST_MIN_LEAD_MIN minutes ahead. */
  when: z.union([z.literal("now"), z.string().datetime({ offset: true })]),
});
export type CreatePostsRequest = z.input<typeof createPostsRequest>;

export const updatePostRequest = z
  .object({
    title: z.string().trim().max(POST_TITLE_MAX, `Keep the title under ${POST_TITLE_MAX} characters`).nullable(),
    caption: z.string().max(POST_CAPTION_MAX, `Keep it under ${POST_CAPTION_MAX.toLocaleString("en-US")} characters`),
    hashtags: z.array(hashtag).max(POST_HASHTAGS_MAX, `Up to ${POST_HASHTAGS_MAX} hashtags`),
    privacy: z.enum(POST_PRIVACY),
    scheduledAt: z.string().datetime({ offset: true }),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, { message: "Nothing to change" });
export type UpdatePostRequest = z.input<typeof updatePostRequest>;

export const linkPostRequest = z.object({
  permalink: z.string().trim().url("Paste the post's link").max(500).refine((u) => /^https?:\/\//.test(u), "Paste the post's link"),
});

export const captionIdeasRequest = z.object({
  accountId: z.string().min(1),
  /** What the video is about, in the person's words. */
  brief: z.string().trim().min(1, "Say what the video is about").max(500),
  tone: z.string().trim().max(60).optional(),
});
export const captionIdeasResponse = z.object({
  captions: z.array(z.object({ text: z.string(), tone: z.string() })),
  /** With the leading #. */
  hashtags: z.array(z.string()),
});
