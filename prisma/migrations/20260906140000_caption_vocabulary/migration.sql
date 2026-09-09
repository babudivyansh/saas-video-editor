-- Per-user caption vocabulary (custom dictionary).
--
-- Proper nouns and jargon a speech model reliably mis-hears for a given user
-- ("Clipiro", "Razorpay", "Next.js"). Held once per user and reused on every
-- caption render rather than re-entered per clip.
--
-- String[] with a default rather than its own table, matching User.dismissedHints:
-- it is a short, flat, user-owned list that is only ever read whole. The DEFAULT
-- means existing rows need no backfill.
ALTER TABLE "User" ADD COLUMN "captionVocabulary" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
