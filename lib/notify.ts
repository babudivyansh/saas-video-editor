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
  | "review_prompt";

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
