// The "post now" queue: an app post to YouTube is uploaded in the background
// instead of inside the request (a phone on mobile data would wait a minute).
// The row is created pending with scheduledFor = now, so if an enqueue is
// lost the clip-publish cron (every 10 min) posts it anyway.

import { logger } from "@/lib/logger";
import { createRenderQueue } from "@/lib/render-queue";
import { runPost } from "@/lib/social/publish";

/** `projectId` is the render-queue's progress key; here it is the post id. */
export interface SocialPublishPayload {
  projectId: string;
  postId: string;
}

export async function socialPublishJob(payload: SocialPublishPayload): Promise<void> {
  const outcome = await runPost(payload.postId);
  if (outcome === "busy") logger.info("social-publish", `post ${payload.postId} waits: today's YouTube uploads are used up`);
}

const queue = createRenderQueue<SocialPublishPayload>("social-publish", socialPublishJob);

/** Starts posting now. Never throws: the cron is the fallback. */
export async function enqueuePost(postId: string): Promise<void> {
  await queue.enqueue(postId, { projectId: postId, postId }).catch((e) => logger.warn("social-publish", `enqueue failed for ${postId}; the cron will post it`, e));
}
