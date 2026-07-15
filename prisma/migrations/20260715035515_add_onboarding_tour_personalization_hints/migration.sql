-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dismissedHints" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "experienceLevel" TEXT,
ADD COLUMN     "teamOrIndividual" TEXT,
ADD COLUMN     "tourCompletedAt" TIMESTAMP(3),
ADD COLUMN     "tourStep" INTEGER;
