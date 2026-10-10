-- Social Studio posts (mobile Phase 11.3, docs/mobile/SCHEDULING.md §3.1).
-- ClipPublish becomes every post to a social account: an owner of its own,
-- a video from Assets as well as a clip, and what gets posted.

ALTER TABLE "ClipPublish" ADD COLUMN "userId" TEXT;
UPDATE "ClipPublish" cp
   SET "userId" = p."userId"
  FROM "Clip" c JOIN "Project" p ON p."id" = c."projectId"
 WHERE c."id" = cp."clipId";
-- Every existing row has a clip (the column was NOT NULL, ON DELETE CASCADE),
-- so the backfill is complete; anything left would be an orphan.
DELETE FROM "ClipPublish" WHERE "userId" IS NULL;
ALTER TABLE "ClipPublish" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "ClipPublish" ALTER COLUMN "clipId" DROP NOT NULL;
ALTER TABLE "ClipPublish" ADD COLUMN "assetId" TEXT;
ALTER TABLE "ClipPublish" ADD COLUMN "title" TEXT;
ALTER TABLE "ClipPublish" ADD COLUMN "caption" TEXT;
ALTER TABLE "ClipPublish" ADD COLUMN "hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ClipPublish" ADD COLUMN "privacy" TEXT NOT NULL DEFAULT 'public';
ALTER TABLE "ClipPublish" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'web';

-- At most one source. Not "exactly one": the asset link is SET NULL on delete,
-- so a posted video's row (permalink, metrics) survives deleting the file.
ALTER TABLE "ClipPublish" ADD CONSTRAINT "ClipPublish_one_source"
  CHECK ("clipId" IS NULL OR "assetId" IS NULL);

ALTER TABLE "ClipPublish" ADD CONSTRAINT "ClipPublish_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClipPublish" ADD CONSTRAINT "ClipPublish_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ClipPublish_userId_scheduledFor_idx" ON "ClipPublish"("userId", "scheduledFor");
CREATE INDEX "ClipPublish_assetId_idx" ON "ClipPublish"("assetId");
