-- One row per UTC day recording what recurring revenue actually was that day
-- (see the model's comment in schema.prisma). Everything else about MRR here
-- is derived from *current* subscription state, so there has never been a way
-- to ask what it was last week; this table is that history, written forward
-- by app/api/cron/mrr-snapshot and never recomputed.
--
-- capturedAt is DATE, not a timestamp, and carries the unique constraint: the
-- cron upserts on it, so a retry — or a scheduler that fires twice — updates
-- the day's reading instead of appending a second row for the same day.
--
-- No backfill accompanies this migration. Reconstructing past MRR would need
-- each user's plan assignment as it was on each past date, which nothing
-- stores; the `source` column exists so that if a defensible reconstruction
-- ever becomes possible those rows stay distinguishable from measured ones.
CREATE TABLE "MrrSnapshot" (
    "id" TEXT NOT NULL,
    "capturedAt" DATE NOT NULL,
    "mrrInPaise" INTEGER NOT NULL,
    "activeSubscribers" INTEGER NOT NULL,
    "newSubs" INTEGER NOT NULL DEFAULT 0,
    "churnedSubs" INTEGER NOT NULL DEFAULT 0,
    "reactivatedSubs" INTEGER NOT NULL DEFAULT 0,
    "planBreakdown" JSONB,
    "source" TEXT NOT NULL DEFAULT 'live',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MrrSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MrrSnapshot_capturedAt_key" ON "MrrSnapshot"("capturedAt");

-- CreateIndex
CREATE INDEX "MrrSnapshot_capturedAt_idx" ON "MrrSnapshot"("capturedAt");
