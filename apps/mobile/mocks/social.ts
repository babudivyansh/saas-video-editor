import { isAutoPost, POST_MIN_LEAD_MIN, socialPostSchema, type CreatePostsRequest, type PostStatus, type SocialPost, type UpdatePostRequest } from "@clipiro/shared";
import { z } from "zod";
import { ApiError, respond, wait } from "./core";

// Stand-in for /api/mobile/v1/social/posts and /social/captions (lib/mobile/posts.ts
// on the server). Scenarios (core.ts): "posts", "captions", "publish".

const at = (dayOffset: number, h: number, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const ACCOUNTS = {
  youtube: { id: "acc_yt", provider: "youtube" as const, name: "Maya Okafor" },
  instagram: { id: "acc_ig", provider: "instagram" as const, name: "maya.okafor" },
  facebook: { id: "acc_fb", provider: "facebook" as const, name: "Maya Creates" },
};
const post = (id: string, title: string, photo: string, when: string, status: PostStatus, extra: Partial<SocialPost> = {}): SocialPost => ({
  id,
  clipId: `clp_${id}`,
  assetId: null,
  title,
  thumbnailUrl: `asset:${photo}`,
  account: ACCOUNTS.youtube,
  caption: "",
  hashtags: [],
  privacy: "public",
  status,
  scheduledAt: when,
  publishedAt: status === "posted" ? when : null,
  permalink: status === "posted" ? `https://www.youtube.com/watch?v=${id}` : null,
  failureReason: null,
  editable: status === "scheduled",
  ...extra,
});

const initial = (): SocialPost[] => [
  post("p1", "Nobody tells you this part", "creator-smile", at(0, 23, 30), "scheduled"),
  post("p2", "We almost shut down twice", "founder-portrait", at(0, 23, 45), "scheduled"),
  post("p3", "The exact cold-email script", "creator-violet", at(1, 9), "scheduled"),
  post("p6", "Hiring your first 10", "creator-hat", at(4, 10), "scheduled", { caption: "Hiring is the job.", hashtags: ["#founders"] }),
  post("p7", "Ship before you're ready", "dj-neon", at(9, 18), "scheduled"),
  post("p8", "Ship before you're ready", "dj-neon", at(-1, 18), "your_turn", { account: ACCOUNTS.instagram, clipId: "clp_o1", caption: "Ship it.", hashtags: ["#startup"] }),
  post("p4", "One more rep", "gym-lift", at(-4, 18), "posted"),
  post("p5", "Why we ignored investors", "creator-golden", at(-5, 18), "failed", { failureReason: "Reconnect your YouTube account to allow uploads, then retry this post." }),
  ...Array.from({ length: 20 }, (_, i) => post(`old${i}`, `Earlier clip ${i + 1}`, "travel-summit", at(-8 - i, 18), "posted")),
];
let POSTS = initial();
let seq = 0;
let lastCreate: CreatePostsRequest | null = null;
/** The last POST /social/posts body (tests check what the Composer sent). */
export const lastCreateRequest = () => lastCreate;

export function resetSocialMocks() {
  POSTS = initial();
  lastCreate = null;
}

const find = (id: string) => {
  const p = POSTS.find((x) => x.id === id);
  if (!p) throw Object.assign(new ApiError("That post isn’t here any more.", 404), { code: "not_found" });
  return p;
};
const replace = (p: SocialPost) => {
  POSTS = POSTS.map((x) => (x.id === p.id ? p : x));
  return p;
};
const refuse = (status: number, message: string, code: string): never => {
  throw Object.assign(new ApiError(message, status), { code });
};

/** GET /social/posts?from=&to=&status= */
export async function listPosts(url: URL): Promise<{ posts: SocialPost[]; nextCursor: null }> {
  const s = await respond("posts");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const status = url.searchParams.get("status");
  const list = s === "empty" ? [] : POSTS.filter((p) => (!from || (p.scheduledAt ?? "") >= from) && (!to || (p.scheduledAt ?? "") <= to) && (!status || p.status === status));
  return { posts: z.array(socialPostSchema).parse([...list].sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""))), nextCursor: null };
}

export async function getPost(id: string) {
  await wait();
  return { post: find(id) };
}

/** POST /social/posts: one per account. "now" to YouTube shows as Posting; to Instagram/Facebook, your turn. */
export async function createPosts(body: CreatePostsRequest) {
  await respond("publish");
  lastCreate = body;
  if (body.when !== "now" && new Date(body.when).getTime() < Date.now() + POST_MIN_LEAD_MIN * 60_000) {
    refuse(400, `Pick a time at least ${POST_MIN_LEAD_MIN} minutes from now`, "invalid_time");
  }
  const accounts = Object.values(ACCOUNTS).filter((a) => body.accountIds.includes(a.id));
  const now = body.when === "now";
  const created = accounts.map((a) =>
    post(`new${++seq}`, body.title || "Nobody tells you this part", "creator-smile", now ? new Date().toISOString() : body.when, now ? (isAutoPost(a.provider) ? "posting" : "your_turn") : "scheduled", {
      account: a,
      clipId: "clipId" in body.source ? body.source.clipId : null,
      assetId: "assetId" in body.source ? body.source.assetId : null,
      caption: body.caption ?? "",
      hashtags: body.hashtags ?? [],
      privacy: body.privacy ?? "public",
    }),
  );
  POSTS = [...created, ...POSTS];
  const warnings = "assetId" in body.source && accounts.some((a) => a.provider === "youtube") ? (["not_short"] as const) : [];
  return { posts: created, warnings: [...warnings] };
}

export async function updatePost(id: string, b: UpdatePostRequest) {
  await wait();
  const p = find(id);
  if (p.status !== "scheduled") refuse(409, "This post has already started, so it can’t be changed.", "not_editable");
  return {
    post: replace({
      ...p,
      ...(b.title !== undefined ? { title: b.title || p.title } : {}),
      ...(b.caption !== undefined ? { caption: b.caption } : {}),
      ...(b.hashtags !== undefined ? { hashtags: b.hashtags } : {}),
      ...(b.privacy !== undefined ? { privacy: b.privacy } : {}),
      ...(b.scheduledAt !== undefined ? { scheduledAt: b.scheduledAt } : {}),
    }),
  };
}

export async function deletePost(id: string) {
  await wait();
  if (find(id).status === "posting") refuse(409, "This post is uploading right now. Try again in a minute.", "posting");
  POSTS = POSTS.filter((p) => p.id !== id);
}

export async function retryPost(id: string) {
  await wait();
  const p = find(id);
  if (p.status !== "failed" && p.status !== "missed") refuse(409, "Only a failed or missed post can be retried.", "not_retryable");
  const auto = isAutoPost(p.account.provider);
  return { post: replace({ ...p, status: auto ? "posting" : "your_turn", failureReason: null, scheduledAt: new Date().toISOString() }) };
}

export async function linkPost(id: string, permalink: string) {
  await wait();
  const p = find(id);
  return { post: replace({ ...p, status: "posted", permalink, publishedAt: new Date().toISOString(), editable: false }) };
}

/** POST /social/captions: the web's caption ideas (charged there). */
export async function captionIdeas(brief: string) {
  await respond("captions");
  return {
    captions: [
      { text: `Most founders never talk about this part. ${brief} — here's what kept us going.`, tone: "honest" },
      { text: `${brief}. Nobody warns you, so I will.`, tone: "punchy" },
      { text: `Save this for the day you want to quit. ${brief}.`, tone: "warm" },
    ],
    hashtags: ["#founders", "#startup", "#podcast", "#creatorlife"],
  };
}
