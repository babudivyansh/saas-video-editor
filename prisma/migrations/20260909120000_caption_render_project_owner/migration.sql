-- Caption renders can now be owned by a Project, not only a Clip.
--
-- AutoClip captions a Clip: a row with its own videoUrl, transcript and
-- duration. reddit-video, split-screen and streamer-video have no Clip at all —
-- the finished video hangs off Project. Rather than a second near-identical
-- model, CaptionRenderJob gains a second optional owner and the app enforces
-- that exactly one is set (lib/captions/renderSource.ts).
--
-- Every existing row is clip-owned and stays exactly as it is: this only drops
-- a NOT NULL and adds a nullable column, so it is safe to run while jobs are
-- in flight.

ALTER TABLE "CaptionRenderJob" ALTER COLUMN "clipId" DROP NOT NULL;
ALTER TABLE "CaptionRenderJob" ADD COLUMN "projectId" TEXT;

ALTER TABLE "CaptionRenderJob"
  ADD CONSTRAINT "CaptionRenderJob_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "CaptionRenderJob_projectId_idx" ON "CaptionRenderJob"("projectId");

-- A clip derives its caption revision from its prior jobs; a project has no
-- such history to read from, so it stores one.
ALTER TABLE "Project" ADD COLUMN "captionRevision" INTEGER NOT NULL DEFAULT 0;

-- Clipiro's canonical transcript for these products' finished video. Without
-- it there is nothing to push to the provider before a paid export, and a
-- reddit video would come back captioned with an ASR guess at the script its
-- own author typed.
ALTER TABLE "Project" ADD COLUMN "captionsJson" JSONB;
