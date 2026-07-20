-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bonusCredits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bonusCreditsExpireAt" TIMESTAMP(3),
ADD COLUMN     "purchasedCredits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "subscriptionCredits" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditTransaction_userId_createdAt_idx" ON "CreditTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditTransaction_refId_idx" ON "CreditTransaction"("refId");

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data migration: move every existing balance into the never-expiring
-- "purchased" bucket so no user loses credits in the policy change, and
-- record the move in the ledger. Legacy "credits" stays as a zeroed column
-- for one release (rollback safety).
UPDATE "User" SET "purchasedCredits" = GREATEST("credits", 0), "credits" = 0 WHERE "credits" <> 0;

INSERT INTO "CreditTransaction" ("id", "userId", "bucket", "delta", "reason")
SELECT gen_random_uuid(), "id", 'purchased', "purchasedCredits", 'migration:bucket-split'
FROM "User" WHERE "purchasedCredits" > 0;
