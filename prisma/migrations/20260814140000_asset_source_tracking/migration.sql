-- AlterTable: Global Asset Library source tracking + processing status.
-- All columns are defaulted/nullable so this is an online-safe, backfill-free
-- migration — existing rows adopt the correct defaults (sourceFeature "upload",
-- status "ready").
ALTER TABLE "Asset" ADD COLUMN "sourceFeature" TEXT NOT NULL DEFAULT 'upload';
ALTER TABLE "Asset" ADD COLUMN "sourceProjectId" TEXT;
ALTER TABLE "Asset" ADD COLUMN "sourceJobId" TEXT;
ALTER TABLE "Asset" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ready';

-- CreateIndex
CREATE INDEX "Asset_userId_sourceProjectId_idx" ON "Asset"("userId", "sourceProjectId");
