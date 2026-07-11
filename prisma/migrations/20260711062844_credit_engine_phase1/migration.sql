-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "tier" TEXT;

-- Backfill tier for already-seeded subscription plans (packs/addons stay null)
UPDATE "Plan" SET "tier" = 'creator' WHERE "slug" LIKE 'sub_creator_%';
UPDATE "Plan" SET "tier" = 'pro'     WHERE "slug" LIKE 'sub_pro_%';
UPDATE "Plan" SET "tier" = 'studio'  WHERE "slug" LIKE 'sub_studio_%';

-- CreateTable
CREATE TABLE "Generation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toolSlug" TEXT NOT NULL,
    "modelId" TEXT,
    "generationType" TEXT NOT NULL,
    "creditsCost" INTEGER NOT NULL,
    "creditPool" TEXT NOT NULL DEFAULT 'standard',
    "estimatedCostUsd" DOUBLE PRECISION,
    "prompt" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Generation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Generation_userId_createdAt_idx" ON "Generation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Generation_modelId_idx" ON "Generation"("modelId");

-- CreateIndex
CREATE INDEX "Generation_toolSlug_createdAt_idx" ON "Generation"("toolSlug", "createdAt");

-- AddForeignKey
ALTER TABLE "Generation" ADD CONSTRAINT "Generation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
