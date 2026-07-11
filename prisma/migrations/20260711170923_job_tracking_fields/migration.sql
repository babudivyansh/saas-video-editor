-- AlterTable
ALTER TABLE "Generation" ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Generation_idempotencyKey_key" ON "Generation"("idempotencyKey");
