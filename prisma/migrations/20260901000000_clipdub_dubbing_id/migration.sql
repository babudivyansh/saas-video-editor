-- AlterTable: ClipDub — persist ElevenLabs' dubbing_id plus the spend context
-- (userId/refId) needed to refund credits from contexts that don't have the
-- original queue payload (the completion webhook route, the fallback cron).
-- All columns nullable, no backfill needed — existing terminal (ready/failed)
-- rows never need them again.
ALTER TABLE "ClipDub" ADD COLUMN "dubbingId" TEXT;
ALTER TABLE "ClipDub" ADD COLUMN "userId" TEXT;
ALTER TABLE "ClipDub" ADD COLUMN "refId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ClipDub_dubbingId_key" ON "ClipDub"("dubbingId");
