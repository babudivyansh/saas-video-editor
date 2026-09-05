-- Date indexes for the admin dashboard's cross-user aggregates.
--
-- Every chart added in #218 filters `WHERE "createdAt" >= <range start>` over
-- the WHOLE table — no userId, because the question is "what happened across
-- the product", not "what did one user do". Each of these tables already had
-- a composite ([userId, createdAt]) index, but Postgres cannot seek into a
-- composite B-tree on its SECOND column, so every one of those queries fell
-- back to a sequential scan. Clip had no date index at all.
--
-- Purchase already carries a standalone ([createdAt]) index, which is why the
-- pre-existing revenue chart never showed this problem and why it went
-- unnoticed until the new sections landed.
--
-- IF NOT EXISTS is deliberate. CREATE INDEX takes an ACCESS EXCLUSIVE lock and
-- blocks writes to the table for as long as the build runs — fine on a small
-- table, an outage on a large one. If any of these is big in production,
-- create it by hand FIRST with:
--
--   CREATE INDEX CONCURRENTLY "CreditTransaction_createdAt_idx"
--     ON "CreditTransaction"("createdAt");
--
-- which takes only a SHARE UPDATE EXCLUSIVE lock and lets writes continue.
-- This migration then finds it already there and does nothing. (CONCURRENTLY
-- cannot be used here directly: Prisma runs each migration inside a
-- transaction, and Postgres forbids it in one.)
CREATE INDEX IF NOT EXISTS "SubscriptionEvent_createdAt_idx" ON "SubscriptionEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "CreditTransaction_createdAt_idx" ON "CreditTransaction"("createdAt");
CREATE INDEX IF NOT EXISTS "LoginEvent_createdAt_idx" ON "LoginEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "Clip_createdAt_idx" ON "Clip"("createdAt");
CREATE INDEX IF NOT EXISTS "Asset_createdAt_idx" ON "Asset"("createdAt");
