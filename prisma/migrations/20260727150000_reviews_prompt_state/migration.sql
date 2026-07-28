-- CreateTable
CREATE TABLE "ReviewPromptState" (
    "userId" TEXT NOT NULL,
    "lastPromptedAt" TIMESTAMP(3),
    "promptCount" INTEGER NOT NULL DEFAULT 0,
    "dismissedAt" TIMESTAMP(3),
    "dismissCount" INTEGER NOT NULL DEFAULT 0,
    "permanentlyDismissedAt" TIMESTAMP(3),
    "lastTrigger" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewPromptState_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "ReviewPromptState" ADD CONSTRAINT "ReviewPromptState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
