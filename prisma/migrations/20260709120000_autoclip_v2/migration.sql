-- AlterTable: Project — AutoClip default caption style + non-fatal warnings
ALTER TABLE "Project" ADD COLUMN "autoClipCaptionStyle" INTEGER;
ALTER TABLE "Project" ADD COLUMN "warnings" JSONB;

-- AlterTable: Clip — calibrated scoring, mood, captions, reframe keyframes,
-- and the new "pending_review" status value (no enum in this schema, no
-- constraint change needed).
ALTER TABLE "Clip" ADD COLUMN "scoreBreakdown" JSONB;
ALTER TABLE "Clip" ADD COLUMN "mood" TEXT;
ALTER TABLE "Clip" ADD COLUMN "transcriptJson" JSONB;
ALTER TABLE "Clip" ADD COLUMN "captionStyleIndex" INTEGER;
ALTER TABLE "Clip" ADD COLUMN "hasCaptions" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Clip" ADD COLUMN "cropKeyframes" JSONB;

-- CreateIndex
CREATE INDEX "Clip_projectId_status_idx" ON "Clip"("projectId", "status");

-- CreateTable: ClipDub (P2.2 multi-language dubbing)
CREATE TABLE "ClipDub" (
    "id" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "targetLang" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'dubbing',
    "videoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClipDub_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClipDub_clipId_idx" ON "ClipDub"("clipId");

-- AddForeignKey
ALTER TABLE "ClipDub" ADD CONSTRAINT "ClipDub_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ClipPublish (P2.5 social publish + analytics loop)
CREATE TABLE "ClipPublish" (
    "id" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "providerPostId" TEXT,
    "permalink" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "metricsJson" JSONB,
    "scheduledFor" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClipPublish_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClipPublish_clipId_idx" ON "ClipPublish"("clipId");

-- CreateIndex
CREATE INDEX "ClipPublish_socialAccountId_idx" ON "ClipPublish"("socialAccountId");

-- AddForeignKey
ALTER TABLE "ClipPublish" ADD CONSTRAINT "ClipPublish_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClipPublish" ADD CONSTRAINT "ClipPublish_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
