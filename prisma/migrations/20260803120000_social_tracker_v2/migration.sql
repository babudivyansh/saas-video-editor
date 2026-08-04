-- AlterTable
ALTER TABLE "SocialAccount" ADD COLUMN     "capabilitiesJson" JSONB,
ADD COLUMN     "healthScore" DOUBLE PRECISION,
ADD COLUMN     "healthScoreAt" TIMESTAMP(3),
ADD COLUMN     "lastDailyMetricDate" DATE,
ADD COLUMN     "timezone" TEXT;

-- AlterTable
ALTER TABLE "CompetitorProfile" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "category" TEXT;

-- AlterTable
ALTER TABLE "CompetitorSnapshot" ADD COLUMN     "avgComments" DOUBLE PRECISION,
ADD COLUMN     "avgLikes" DOUBLE PRECISION,
ADD COLUMN     "engagementRate" DOUBLE PRECISION,
ADD COLUMN     "following" INTEGER,
ADD COLUMN     "postsCount" INTEGER,
ADD COLUMN     "postsPerWeek" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "SocialAudienceSnapshot" ADD COLUMN     "audience" TEXT NOT NULL DEFAULT 'followers',
ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'percent';

-- AlterTable
ALTER TABLE "SocialPost" ADD COLUMN     "aiScore" DOUBLE PRECISION,
ADD COLUMN     "aiScoreReason" TEXT,
ADD COLUMN     "avgViewPercentage" DOUBLE PRECISION,
ADD COLUMN     "avgWatchTimeSec" DOUBLE PRECISION,
ADD COLUMN     "ctr" DOUBLE PRECISION,
ADD COLUMN     "follows" INTEGER,
ADD COLUMN     "impressions" INTEGER,
ADD COLUMN     "linkClicks" INTEGER,
ADD COLUMN     "navigationTaps" INTEGER,
ADD COLUMN     "plays" INTEGER,
ADD COLUMN     "profileVisits" INTEGER,
ADD COLUMN     "scoredAt" TIMESTAMP(3),
ADD COLUMN     "viralScore" DOUBLE PRECISION,
ADD COLUMN     "viralScoreAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SocialDailyMetric" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "impressions" INTEGER,
    "reach" INTEGER,
    "views" INTEGER,
    "plays" INTEGER,
    "followers" INTEGER,
    "followersGained" INTEGER,
    "followersLost" INTEGER,
    "profileViews" INTEGER,
    "websiteClicks" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "saves" INTEGER,
    "totalInteractions" INTEGER,
    "accountsEngaged" INTEGER,
    "watchTimeSec" DOUBLE PRECISION,
    "avgViewDurationSec" DOUBLE PRECISION,
    "avgViewPercentage" DOUBLE PRECISION,
    "ctr" DOUBLE PRECISION,
    "postsPublished" INTEGER,
    "extraJson" JSONB,
    "source" TEXT NOT NULL DEFAULT 'provider',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialDailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT,
    "metric" TEXT NOT NULL,
    "target" DOUBLE PRECISION NOT NULL,
    "baseline" DOUBLE PRECISION,
    "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "hitAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialReportConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountIds" TEXT[],
    "period" TEXT NOT NULL,
    "sections" TEXT[],
    "format" TEXT NOT NULL,
    "schedule" TEXT NOT NULL DEFAULT 'none',
    "recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialReportConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialReportRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "configId" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "format" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "storageKey" TEXT,
    "sizeBytes" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SocialReportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialReportLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "accountIds" TEXT[],
    "sections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialReportLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialDailyMetric_accountId_date_idx" ON "SocialDailyMetric"("accountId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SocialDailyMetric_accountId_date_key" ON "SocialDailyMetric"("accountId", "date");

-- CreateIndex
CREATE INDEX "SocialGoal_userId_status_idx" ON "SocialGoal"("userId", "status");

-- CreateIndex
CREATE INDEX "SocialGoal_accountId_status_idx" ON "SocialGoal"("accountId", "status");

-- CreateIndex
CREATE INDEX "SocialReportConfig_userId_idx" ON "SocialReportConfig"("userId");

-- CreateIndex
CREATE INDEX "SocialReportConfig_schedule_lastRunAt_idx" ON "SocialReportConfig"("schedule", "lastRunAt");

-- CreateIndex
CREATE INDEX "SocialReportRun_userId_createdAt_idx" ON "SocialReportRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SocialReportRun_status_createdAt_idx" ON "SocialReportRun"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialReportLink_jti_key" ON "SocialReportLink"("jti");

-- CreateIndex
CREATE INDEX "SocialReportLink_userId_createdAt_idx" ON "SocialReportLink"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SocialAudienceSnapshot_accountId_capturedAt_dimension_idx" ON "SocialAudienceSnapshot"("accountId", "capturedAt", "dimension");

-- CreateIndex
CREATE INDEX "SocialPost_accountId_viralScore_idx" ON "SocialPost"("accountId", "viralScore" DESC);

-- AddForeignKey
ALTER TABLE "SocialDailyMetric" ADD CONSTRAINT "SocialDailyMetric_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialGoal" ADD CONSTRAINT "SocialGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialGoal" ADD CONSTRAINT "SocialGoal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialReportConfig" ADD CONSTRAINT "SocialReportConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialReportRun" ADD CONSTRAINT "SocialReportRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialReportLink" ADD CONSTRAINT "SocialReportLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

