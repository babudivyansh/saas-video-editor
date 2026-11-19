// Records what a user did when no other table already holds it — see the
// UserEvent model. Server-side only, so counts are authoritative (no ad
// blockers, no consent banner gaps), and only meaningful actions: never page
// views, keystrokes or file contents.
//
// Never throws, same contract as lib/notify.ts: losing one activity row must
// not fail the signup or download that caused it.

import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { ATTRIBUTION_COOKIE, parseAttributionCookie, type UtmTuple } from "@/lib/marketing-attribution";

export type UserEventType = "signup" | "download";

export interface SignupEventMeta {
  method: "email" | "google";
  referralCode?: string;
  /**
   * First-touch campaign tags (the mkt_attr cookie). Until now these were only
   * counted per day (MarketingEventDaily), so no single signup could be traced
   * to its campaign.
   */
  utm?: UtmTuple;
}

/** The signup's campaign tags, if the browser arrived through a tagged link. */
export function signupUtm(req: { cookies: { get(name: string): { value: string } | undefined } }): UtmTuple | undefined {
  return parseAttributionCookie(req.cookies.get(ATTRIBUTION_COOKIE)?.value) ?? undefined;
}

export interface DownloadEventMeta {
  /** File name offered to the browser. */
  name: string;
  /** First path segment of the S3 key — "clips", "exports", "zips", … */
  area: string;
}

type MetaFor<T extends UserEventType> = T extends "signup" ? SignupEventMeta : DownloadEventMeta;

export async function recordUserEvent<T extends UserEventType>(
  userId: string,
  type: T,
  meta: MetaFor<T>,
  dedupeKey?: string,
): Promise<void> {
  try {
    await prisma.userEvent.create({
      data: { userId, type, meta: meta as unknown as Prisma.InputJsonValue, dedupeKey: dedupeKey ?? null },
    });
  } catch (e) {
    // A repeat of a once-only event is expected, not a failure.
    if ((e as { code?: string }).code === "P2002") return;
    logger.warn("user-events", `could not record ${type} for ${userId}`, { reason: (e as Error).message });
  }
}

export function recordSignupEvent(userId: string, meta: SignupEventMeta): Promise<void> {
  return recordUserEvent(userId, "signup", meta, `signup:${userId}`);
}

/** One row per user per file: re-downloading the same file isn't a new event. */
export function recordDownloadEvent(userId: string, s3Key: string, name: string): Promise<void> {
  const keyHash = createHash("sha1").update(s3Key).digest("hex").slice(0, 24);
  return recordUserEvent(userId, "download", { name, area: s3Key.split("/")[0] || "other" }, `download:${userId}:${keyHash}`);
}
