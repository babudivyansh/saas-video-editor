-- Admin content review: who watched each upload / clip, and when.
ALTER TABLE "Clip" ADD COLUMN "adminReviewedAt" TIMESTAMP(3),
ADD COLUMN "adminReviewedById" TEXT;
ALTER TABLE "Asset" ADD COLUMN "adminReviewedAt" TIMESTAMP(3),
ADD COLUMN "adminReviewedById" TEXT;

CREATE INDEX "Clip_adminReviewedAt_createdAt_idx" ON "Clip"("adminReviewedAt", "createdAt");
CREATE INDEX "Asset_adminReviewedAt_createdAt_idx" ON "Asset"("adminReviewedAt", "createdAt");
