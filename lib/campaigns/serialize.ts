// The campaign shape the admin API returns.

import type { EmailCampaign } from "@prisma/client";
import { readAudience } from "./audience";
import { describeAudience } from "./audience-schema";

export function serializeCampaign(c: EmailCampaign) {
  const audience = readAudience(c.audience);
  return {
    id: c.id,
    name: c.name,
    subject: c.subject,
    preheader: c.preheader,
    blocks: c.blocks,
    audience,
    audienceLabel: describeAudience(audience),
    utmCampaign: c.utmCampaign,
    status: c.status,
    scheduledAt: c.scheduledAt?.toISOString() ?? null,
    startedAt: c.startedAt?.toISOString() ?? null,
    completedAt: c.completedAt?.toISOString() ?? null,
    audienceCount: c.audienceCount,
    sentCount: c.sentCount,
    skippedCount: c.skippedCount,
    failedCount: c.failedCount,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
