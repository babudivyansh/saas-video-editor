-- CreateTable
CREATE TABLE "ClonedVoice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "elevenLabsVoiceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClonedVoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClonedVoice_elevenLabsVoiceId_key" ON "ClonedVoice"("elevenLabsVoiceId");

-- CreateIndex
CREATE INDEX "ClonedVoice_userId_idx" ON "ClonedVoice"("userId");

-- AddForeignKey
ALTER TABLE "ClonedVoice" ADD CONSTRAINT "ClonedVoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
