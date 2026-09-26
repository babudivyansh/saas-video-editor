-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bonusMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bonusMinutesExpireAt" TIMESTAMP(3),
ADD COLUMN     "minutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "monthlyMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "purchasedMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "subscriptionMinutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "minutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "monthlyMinutes" INTEGER;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "minutes" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MinuteTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MinuteTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MinuteTransaction_userId_createdAt_idx" ON "MinuteTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MinuteTransaction_refId_idx" ON "MinuteTransaction"("refId");

-- CreateIndex
CREATE INDEX "MinuteTransaction_createdAt_idx" ON "MinuteTransaction"("createdAt");

-- AddForeignKey
ALTER TABLE "MinuteTransaction" ADD CONSTRAINT "MinuteTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

