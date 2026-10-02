import { composeRequest, scheduledPostSchema, type ComposeRequest, type ScheduledPost } from "@clipiro/shared";
import { z } from "zod";
import { ApiError, respond, wait } from "./core";

// Stand-in for Phase 11's scheduling API and the web's /api/social/captions.
// Scenarios (core.ts): "posts", "captions", "publish".

const at = (dayOffset: number, h: number, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const post = (id: string, title: string, photo: string, when: string, status: ScheduledPost["status"], failureReason: string | null = null): ScheduledPost => ({
  id,
  clipId: `clp_${id}`,
  title,
  thumbnailUrl: `asset:${photo}`,
  provider: "youtube",
  caption: "",
  hashtags: [],
  scheduledAt: when,
  status,
  failureReason,
});

const INITIAL: ScheduledPost[] = [
  post("p1", "Nobody tells you this part", "creator-smile", at(0, 18), "scheduled"),
  post("p2", "We almost shut down twice", "founder-portrait", at(0, 20, 30), "scheduled"),
  post("p3", "The exact cold-email script", "creator-violet", at(1, 9), "scheduled"),
  post("p6", "Hiring your first 10", "creator-hat", at(4, 10), "scheduled"),
  post("p7", "Ship before you're ready", "dj-neon", at(9, 18), "scheduled"),
  post("p4", "One more rep", "gym-lift", at(-4, 18), "posted"),
  post("p5", "Why we ignored investors", "creator-golden", at(-5, 18), "failed", "YouTube rejected the upload: the account needs reconnecting."),
  ...Array.from({ length: 20 }, (_, i) => post(`old${i}`, `Earlier clip ${i + 1}`, "travel-summit", at(-8 - i, 18), "posted" as const)),
];
let POSTS = INITIAL;
let seq = 0;

export function resetSocialMocks() {
  POSTS = INITIAL;
}

export async function getPosts(): Promise<ScheduledPost[]> {
  const s = await respond("posts");
  return z.array(scheduledPostSchema).parse(s === "empty" ? [] : POSTS);
}

/** The web's caption generator: free, 20 an hour. */
export async function suggestCaptions(title: string): Promise<{ captions: string[]; hashtags: string[] }> {
  await respond("captions");
  return {
    captions: [
      `Most founders never talk about this part. ${title} — here's what kept us going.`,
      `${title}. Nobody warns you, so I will.`,
      `Save this for the day you want to quit. ${title}.`,
    ],
    hashtags: ["#founders", "#startup", "#podcast", "#creatorlife"],
  };
}

export async function publish(input: ComposeRequest & { title: string; thumbnailUrl: string }): Promise<ScheduledPost> {
  const parsed = composeRequest.safeParse(input);
  if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? "Check the post", 400);
  await respond("publish");
  const p: ScheduledPost = {
    id: `new${++seq}`,
    clipId: input.clipId,
    title: input.title,
    thumbnailUrl: input.thumbnailUrl,
    provider: "youtube",
    caption: input.caption,
    hashtags: input.hashtags,
    scheduledAt: input.when === "now" ? new Date().toISOString() : input.scheduledAt!,
    status: input.when === "now" ? "posted" : "scheduled",
    failureReason: null,
  };
  POSTS = [p, ...POSTS];
  return p;
}

export async function retryPost(id: string) {
  await wait();
  POSTS = POSTS.map((p) => (p.id === id ? { ...p, status: "scheduled" as const, failureReason: null, scheduledAt: new Date(Date.now() + 5 * 60_000).toISOString() } : p));
}

export async function deletePost(id: string) {
  await wait();
  POSTS = POSTS.filter((p) => p.id !== id);
}
