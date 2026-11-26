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
import { type UpgradePlacement } from "@/lib/conversion";
import { ATTRIBUTION_COOKIE, parseAttributionCookie, type UtmTuple } from "@/lib/marketing-attribution";

/**
 * signup / download: what the user did. upgrade_prompt, plans_viewed and
 * checkout are the paywall funnel (2026-11-26): where an offer was shown or
 * clicked, who opened the plans, and what happened at checkout — none of which
 * was recorded before, so nobody could tell "never saw an offer" from "tried
 * to pay and gave up".
 */
export type UserEventType = "signup" | "download" | "upgrade_prompt" | "plans_viewed" | "checkout";

export interface UpgradePromptMeta {
  placement: UpgradePlacement;
  action: "shown" | "clicked";
  /** What the prompt offered. */
  offer?: "trial" | "pack" | "plans";
}

export interface PlansViewedMeta {
  placement: UpgradePlacement;
}

export interface CheckoutEventMeta {
  stage: "started" | "dismissed" | "failed";
  plan: string;
  placement: UpgradePlacement;
  trial?: boolean;
  /** Razorpay's error code/description on a failed payment. */
  reason?: string;
}

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

type MetaFor<T extends UserEventType> =
  T extends "signup" ? SignupEventMeta
  : T extends "download" ? DownloadEventMeta
  : T extends "upgrade_prompt" ? UpgradePromptMeta
  : T extends "plans_viewed" ? PlansViewedMeta
  : CheckoutEventMeta;

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

const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

/**
 * Paywall funnel events. "Shown" is kept to one row per user, placement and
 * UTC day (a banner re-rendering on every visit is still one sighting), and
 * plans_viewed likewise; clicks and checkout steps are all kept.
 */
export function recordFunnelEvent(
  userId: string,
  e:
    | { type: "upgrade_prompt"; meta: UpgradePromptMeta }
    | { type: "plans_viewed"; meta: PlansViewedMeta }
    | { type: "checkout"; meta: CheckoutEventMeta },
): Promise<void> {
  if (e.type === "upgrade_prompt") {
    const key = e.meta.action === "shown" ? `upg:${userId}:${e.meta.placement}:${utcDay()}` : undefined;
    return recordUserEvent(userId, "upgrade_prompt", e.meta, key);
  }
  if (e.type === "plans_viewed") {
    return recordUserEvent(userId, "plans_viewed", e.meta, `plans:${userId}:${e.meta.placement}:${utcDay()}`);
  }
  return recordUserEvent(userId, "checkout", e.meta);
}

/** One row per user per file: re-downloading the same file isn't a new event. */
export function recordDownloadEvent(userId: string, s3Key: string, name: string): Promise<void> {
  const keyHash = createHash("sha1").update(s3Key).digest("hex").slice(0, 24);
  return recordUserEvent(userId, "download", { name, area: s3Key.split("/")[0] || "other" }, `download:${userId}:${keyHash}`);
}
