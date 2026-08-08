-- AlterTable
-- Add with a temporary default to backfill existing rows, then drop it: the
-- Prisma schema declares `updatedAt DateTime @updatedAt` with NO @default, so a
-- lingering DB default would show up as schema drift (CI's migrate-diff gate).
ALTER TABLE "Clip" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Clip" ALTER COLUMN "updatedAt" DROP DEFAULT;
