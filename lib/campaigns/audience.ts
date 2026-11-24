// Who a campaign goes to.
//
// An audience is the Accounts page's funnel filters (lib/admin/user-filters.ts,
// so "See who" on Analytics and a campaign audience mean the same people) plus
// a plan filter. Whatever is picked, the base rules below always apply: a
// campaign only ever reaches a verified, active customer who has not switched
// marketing email off and whose address has not bounced or complained.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildUserWhere } from "@/lib/admin/user-filters";
import { campaignAudienceSchema, type CampaignAudience } from "./audience-schema";

export { campaignAudienceSchema, type CampaignAudience };

/** Parse a stored audience, falling back to "everyone eligible" if it's malformed. */
export function readAudience(value: unknown): CampaignAudience {
  const parsed = campaignAudienceSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : { plan: "all" };
}

/** Rules every campaign recipient must meet, whatever the audience. */
export function baseEligibility(): Prisma.UserWhereInput {
  return {
    role: "USER",
    emailVerifiedAt: { not: null },
    deactivatedAt: null,
    suspendedAt: null,
    purgedAt: null,
    // No preference row means every category is on (lib/notifications.ts).
    OR: [{ notificationPreference: null }, { notificationPreference: { marketingEmails: true } }],
  };
}

export function audienceWhere(a: CampaignAudience, now: Date = new Date()): Prisma.UserWhereInput {
  const params = new URLSearchParams();
  if (a.journey) params.set("journey", a.journey);
  if (a.joined) params.set("joined", a.joined);
  if (a.active) params.set("active", a.active);
  if (a.method) params.set("method", a.method);

  const paid: Prisma.UserWhereInput = { subscriptionEndsAt: { gt: now }, planId: { not: null } };
  const and: Prisma.UserWhereInput[] = [baseEligibility(), buildUserWhere(params, now)];
  if (a.plan === "paid") and.push(paid);
  else if (a.plan === "free") and.push({ NOT: paid });
  return { AND: and };
}

/** Suppressed addresses (hard bounce / complaint / manual). Small by nature. */
async function suppressedEmails(): Promise<string[]> {
  const rows = await prisma.emailSuppression.findMany({ select: { email: true }, take: 10_000 });
  return rows.map((r) => r.email);
}

/** How many people a campaign with this audience would reach right now. */
export async function countAudience(a: CampaignAudience, now: Date = new Date()): Promise<number> {
  const suppressed = await suppressedEmails();
  return prisma.user.count({
    where: { AND: [audienceWhere(a, now), ...(suppressed.length ? [{ email: { notIn: suppressed } }] : [])] },
  });
}

/**
 * Write one pending EmailCampaignRecipient per eligible user, in pages, so the
 * send queue is fixed at the moment sending starts. skipDuplicates + the
 * (campaignId, userId) unique make a re-run harmless. Returns the queue size.
 */
export async function snapshotRecipients(campaignId: string, a: CampaignAudience, now: Date = new Date()): Promise<number> {
  const suppressed = await suppressedEmails();
  const where: Prisma.UserWhereInput = {
    AND: [audienceWhere(a, now), ...(suppressed.length ? [{ email: { notIn: suppressed } }] : [])],
  };
  const PAGE = 1000;
  let cursor: string | undefined;
  for (;;) {
    const users = await prisma.user.findMany({
      where,
      select: { id: true },
      orderBy: { id: "asc" },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (users.length === 0) break;
    await prisma.emailCampaignRecipient.createMany({
      data: users.map((u) => ({ campaignId, userId: u.id })),
      skipDuplicates: true,
    });
    cursor = users[users.length - 1].id;
    if (users.length < PAGE) break;
  }
  return prisma.emailCampaignRecipient.count({ where: { campaignId } });
}
