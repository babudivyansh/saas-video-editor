-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "company" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "publicDisplayConsent" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "wouldRecommend" BOOLEAN;

-- CreateTable
CREATE TABLE "ReviewPromptEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "featureHint" TEXT,
    "shownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedAt" TIMESTAMP(3),
    "permanentDismiss" BOOLEAN NOT NULL DEFAULT false,
    "convertedAt" TIMESTAMP(3),
    "reviewId" TEXT,

    CONSTRAINT "ReviewPromptEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewEmailSequence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "triggerEventAt" TIMESTAMP(3) NOT NULL,
    "sourceTrigger" TEXT NOT NULL,
    "email1SentAt" TIMESTAMP(3),
    "email1OpenedAt" TIMESTAMP(3),
    "email1ClickedAt" TIMESTAMP(3),
    "email2SentAt" TIMESTAMP(3),
    "email2OpenedAt" TIMESTAMP(3),
    "email2ClickedAt" TIMESTAMP(3),
    "email3SentAt" TIMESTAMP(3),
    "email3OpenedAt" TIMESTAMP(3),
    "email3ClickedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewEmailSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestimonialImpression" (
    "date" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TestimonialImpression_pkey" PRIMARY KEY ("date")
);

-- CreateIndex
CREATE INDEX "ReviewPromptEvent_userId_shownAt_idx" ON "ReviewPromptEvent"("userId", "shownAt");

-- CreateIndex
CREATE INDEX "ReviewPromptEvent_trigger_shownAt_idx" ON "ReviewPromptEvent"("trigger", "shownAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewEmailSequence_userId_key" ON "ReviewEmailSequence"("userId");

-- CreateIndex
CREATE INDEX "ReviewEmailSequence_cancelledAt_triggerEventAt_idx" ON "ReviewEmailSequence"("cancelledAt", "triggerEventAt");

-- AddForeignKey
ALTER TABLE "ReviewPromptEvent" ADD CONSTRAINT "ReviewPromptEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewEmailSequence" ADD CONSTRAINT "ReviewEmailSequence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
