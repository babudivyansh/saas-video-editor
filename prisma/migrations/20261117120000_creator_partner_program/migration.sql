-- Creator partner programme (2026-11-17). Columns only, all nullable or with a
-- default, so this is additive and safe to apply ahead of the code.

ALTER TABLE "Affiliate"
  ADD COLUMN "isCreatorPartner" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "creatorHandle" TEXT,
  ADD COLUMN "creatorSince" TIMESTAMP(3),
  ADD COLUMN "creatorGoalReachedAt" TIMESTAMP(3),
  ADD COLUMN "creatorRewardGrantedAt" TIMESTAMP(3),
  ADD COLUMN "creatorRewardGrantedBy" TEXT;

ALTER TABLE "Referral"
  ADD COLUMN "qualifiedAt" TIMESTAMP(3),
  ADD COLUMN "qualifyingTier" TEXT,
  ADD COLUMN "qualifyingPaymentId" TEXT;

CREATE INDEX "Referral_qualifyingPaymentId_idx" ON "Referral"("qualifyingPaymentId");
