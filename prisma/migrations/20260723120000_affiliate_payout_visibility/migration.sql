-- AlterTable
ALTER TABLE "Affiliate" ADD COLUMN     "payoutRequestedAt" TIMESTAMP(3),
ADD COLUMN     "payoutThresholdNotifiedAt" TIMESTAMP(3);
