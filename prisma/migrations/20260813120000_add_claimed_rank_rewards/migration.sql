-- AlterTable
ALTER TABLE "User" ADD COLUMN "claimedRankRewards" TEXT[] DEFAULT ARRAY[]::TEXT[];
