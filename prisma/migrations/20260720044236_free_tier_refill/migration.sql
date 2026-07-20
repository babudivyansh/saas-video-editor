-- AlterTable
ALTER TABLE "User" ADD COLUMN     "freeCreditsRefillAt" TIMESTAMP(3);

-- Backfill: every user without an active subscription becomes due for their
-- first free-tier monthly grant immediately.
UPDATE "User" SET "freeCreditsRefillAt" = NOW() WHERE "planId" IS NULL;
