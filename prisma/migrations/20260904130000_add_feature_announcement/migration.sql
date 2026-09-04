-- Admin-authored broadcast that finally gives the featureReleases/newsletter
-- NotificationPreference toggles a real producer (see the model's comment in
-- schema.prisma). publishedAt/sentAt are separate columns rather than a
-- status enum so "picked up once by the cron" is a plain
-- `publishedAt IS NOT NULL AND sentAt IS NULL` filter, matching the pattern
-- app/api/cron/account-purge already uses for its own due/blocked scan.
CREATE TABLE "FeatureAnnouncement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "ctaLabel" TEXT,
    "ctaUrl" TEXT,
    "audience" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "recipientCount" INTEGER,
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeatureAnnouncement_publishedAt_sentAt_idx" ON "FeatureAnnouncement"("publishedAt", "sentAt");
