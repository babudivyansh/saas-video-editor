-- AlterTable
ALTER TABLE "User" ADD COLUMN     "questRewardClaimed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "UserQuest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserQuest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserQuest_userId_questId_key" ON "UserQuest"("userId", "questId");

-- AddForeignKey
ALTER TABLE "UserQuest" ADD CONSTRAINT "UserQuest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
