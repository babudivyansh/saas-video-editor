-- One free trial per card or UPI ID (lib/billing/trial-instrument.ts): an HMAC
-- of the instrument that authorised each trial. No foreign key to "User" on
-- purpose, so deleting an account does not free the card for another trial.

-- CreateTable
CREATE TABLE "TrialInstrument" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialInstrument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrialInstrument_subscriptionId_key" ON "TrialInstrument"("subscriptionId");

-- CreateIndex
CREATE INDEX "TrialInstrument_fingerprint_idx" ON "TrialInstrument"("fingerprint");

