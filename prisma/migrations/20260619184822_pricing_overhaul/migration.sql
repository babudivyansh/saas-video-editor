-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "intervalMonths" INTEGER,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'pack',
ADD COLUMN     "monthlyCredits" INTEGER,
ADD COLUMN     "veo3Included" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "monthlyCredits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nextRefillAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionEndsAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionId" TEXT,
ADD COLUMN     "veo3Enabled" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "credits" SET DEFAULT 0;
