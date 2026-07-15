-- CreateTable
CREATE TABLE "SocialAudienceSnapshot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dimension" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SocialAudienceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialAudienceSnapshot_accountId_dimension_capturedAt_idx" ON "SocialAudienceSnapshot"("accountId", "dimension", "capturedAt");

-- AddForeignKey
ALTER TABLE "SocialAudienceSnapshot" ADD CONSTRAINT "SocialAudienceSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
