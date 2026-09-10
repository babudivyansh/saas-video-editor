-- Drop three columns that no code path has ever written.
--
-- CompetitorProfile.category and .bio: normalizeProfile in
-- lib/social/competitor-source.ts only ever returned displayName, avatarUrl and
-- followers, so these have been NULL for every row since the table was created.
-- CompetitorSnapshot.following: same — the vendor adapter never captured it.
--
-- Dropping rather than keeping them nullable: a column that exists is a column
-- a future comparison view can be built against, and it would render a blank
-- field for every profile with nothing to explain why.
ALTER TABLE "CompetitorProfile" DROP COLUMN IF EXISTS "category";
ALTER TABLE "CompetitorProfile" DROP COLUMN IF EXISTS "bio";
ALTER TABLE "CompetitorSnapshot" DROP COLUMN IF EXISTS "following";
