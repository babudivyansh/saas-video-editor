-- AlterTable
ALTER TABLE "SocialAccount" ADD COLUMN     "lastSyncStatus" TEXT NOT NULL DEFAULT 'ok',
ADD COLUMN     "lastSyncError" TEXT;
