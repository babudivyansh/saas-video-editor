-- AlterTable
ALTER TABLE "User" ADD COLUMN     "razorpaySubscriptionId" TEXT,
ADD COLUMN     "razorpayCustomerId" TEXT,
ADD COLUMN     "trialUsedAt" TIMESTAMP(3),
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "razorpayPlanIdInr" TEXT,
ADD COLUMN     "razorpayPlanIdUsd" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_razorpaySubscriptionId_key" ON "User"("razorpaySubscriptionId");
