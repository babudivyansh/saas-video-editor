-- AlterTable
ALTER TABLE "Affiliate" ADD COLUMN     "codeExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Referral_affiliateId_idx" ON "Referral"("affiliateId");

-- CreateIndex
CREATE INDEX "Commission_affiliateId_idx" ON "Commission"("affiliateId");

-- CreateIndex
CREATE INDEX "Commission_referralId_idx" ON "Commission"("referralId");
