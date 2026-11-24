-- Admin → Campaigns: HTML marketing campaigns sent in throttled batches
-- (lib/campaigns/, app/api/cron/email-campaigns).

-- CreateTable
CREATE TABLE "EmailCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "preheader" TEXT NOT NULL,
    "blocks" JSONB NOT NULL,
    "audience" JSONB NOT NULL,
    "utmCampaign" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "audienceCount" INTEGER,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailCampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "detail" TEXT,
    "messageId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailCampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailCampaign_status_scheduledAt_idx" ON "EmailCampaign"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailCampaignRecipient_campaignId_userId_key" ON "EmailCampaignRecipient"("campaignId", "userId");

-- CreateIndex
CREATE INDEX "EmailCampaignRecipient_campaignId_status_idx" ON "EmailCampaignRecipient"("campaignId", "status");

-- CreateIndex
CREATE INDEX "EmailCampaignRecipient_status_sentAt_idx" ON "EmailCampaignRecipient"("status", "sentAt");

-- CreateIndex
CREATE INDEX "EmailCampaignRecipient_userId_idx" ON "EmailCampaignRecipient"("userId");

-- AddForeignKey
ALTER TABLE "EmailCampaignRecipient" ADD CONSTRAINT "EmailCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaignRecipient" ADD CONSTRAINT "EmailCampaignRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same lockdown every table gets since 20261028120000_rls_lockdown: Prisma
-- connects as the owner (bypasses RLS); the anon/authenticated API roles get nothing.
ALTER TABLE "EmailCampaign" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailCampaignRecipient" ENABLE ROW LEVEL SECURITY;
