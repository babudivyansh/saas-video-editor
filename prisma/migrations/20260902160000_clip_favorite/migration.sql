-- Starring a clip. The clips library can now list every clip a user owns
-- across all their projects, which makes "the good one" worth marking —
-- previously there was nowhere to see clips together, so there was nothing to
-- pick out of.
ALTER TABLE "Clip" ADD COLUMN "isFavorite" BOOLEAN NOT NULL DEFAULT false;
