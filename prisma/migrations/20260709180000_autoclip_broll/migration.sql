-- AlterTable: Clip — auto B-roll (P2.3)
ALTER TABLE "Clip" ADD COLUMN "brollQuery" TEXT;
ALTER TABLE "Clip" ADD COLUMN "brollUrl" TEXT;
ALTER TABLE "Clip" ADD COLUMN "brollStartSec" DOUBLE PRECISION;
ALTER TABLE "Clip" ADD COLUMN "brollEndSec" DOUBLE PRECISION;
