-- Projects → Clips flow: thumbs-down on clips, the AutoClip instructions kept
-- on the project, and user-made clip collections.
ALTER TABLE "Clip" ADD COLUMN "isDisliked" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Project" ADD COLUMN "instructions" TEXT;

CREATE TABLE "ClipCollection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClipCollection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClipCollectionItem" (
    "collectionId" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClipCollectionItem_pkey" PRIMARY KEY ("collectionId", "clipId")
);

CREATE INDEX "ClipCollection_userId_createdAt_idx" ON "ClipCollection"("userId", "createdAt");

CREATE INDEX "ClipCollectionItem_clipId_idx" ON "ClipCollectionItem"("clipId");

ALTER TABLE "ClipCollection" ADD CONSTRAINT "ClipCollection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClipCollectionItem" ADD CONSTRAINT "ClipCollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "ClipCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClipCollectionItem" ADD CONSTRAINT "ClipCollectionItem_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
