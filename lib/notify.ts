// Generic in-app notification writer — top-level, not review-specific, even
// though Reviews is the first caller. Mirrors lib/admin/audit.ts's
// never-throws contract: a notification failure must not fail the action
// that triggered it, but it IS logged, not silently swallowed.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export type NotificationType =
  | "review_published"
  | "review_rejected"
  | "review_hidden"
  | "review_reply"
  | "review_helpful_milestone"
  | "admin_review_new"
  | "admin_review_reported"
  | "admin_review_spam_detected"
  | "review_prompt"
  // Billing (2026-07 audit). The bell was review-only, so nothing about money
  // ever reached the user in-app — a declined card had no surface at all.
  | "billing_payment_failed"
  | "billing_subscription_halted"
  // Auto Clip render outcome. Renders take minutes and the user previously had
  // to sit on the page polling — nothing told them when clips were ready (or
  // that a render had failed).
  | "autoclip_render_complete"
  | "autoclip_render_failed"
  // Editor export outcome (mobile Phase 9.3): the phone leaves the Export
  // screen while the server renders, so the result has to find the user.
  | "editor_export_complete"
  | "editor_export_failed";

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
  metadata?: Record<string, unknown>;
}

export async function notify(input: NotifyInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        href: input.href,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
    pushInBackground([input]);
  } catch (e) {
    logger.warn("notify", `notification write failed for ${input.type} -> ${input.userId}`, {
      reason: (e as Error).message,
    });
  }
}

export async function notifyMany(inputs: NotifyInput[]): Promise<void> {
  if (inputs.length === 0) return;
  try {
    await prisma.notification.createMany({
      data: inputs.map((i) => ({
        userId: i.userId,
        type: i.type,
        title: i.title,
        body: i.body,
        href: i.href,
        metadata: i.metadata as Prisma.InputJsonValue | undefined,
      })),
    });
    pushInBackground(inputs);
  } catch (e) {
    logger.warn("notify", `bulk notification write failed (${inputs.length} rows)`, { reason: (e as Error).message });
  }
}

export async function notifyAdmins(
  type: NotificationType,
  title: string,
  body?: string,
  href?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  await notifyMany(admins.map((a) => ({ userId: a.id, type, title, body, href, metadata })));
}

/**
 * The types lib/push.ts sends to phones. Kept here so every other
 * notification skips the push path entirely (no import, no query).
 */
export const PUSH_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  "autoclip_render_complete",
  "autoclip_render_failed",
  "editor_export_complete",
  "editor_export_failed",
  "billing_payment_failed",
  "billing_subscription_halted",
]);

/**
 * The phone push beside an in-app notification. Fire-and-forget, loaded on
 * first use: a push must not slow or fail the caller. Off under the test
 * runner, where it would outlive the test (lib/push.test.ts covers it).
 */
function pushInBackground(inputs: NotifyInput[]) {
  const pushable = inputs.filter((i) => PUSH_TYPES.has(i.type));
  if (pushable.length === 0 || process.env.NODE_ENV === "test") return;
  void import("@/lib/push")
    .then((m) => m.sendPushes(pushable))
    .catch(() => {});
}
