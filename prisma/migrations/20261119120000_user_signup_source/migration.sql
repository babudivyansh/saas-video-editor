-- Per-user signup source (2026-11-19 conversion work). Nullable columns only,
-- so additive and safe to apply ahead of the code.

ALTER TABLE "User"
  ADD COLUMN "signupSource" TEXT,
  ADD COLUMN "signupReferrer" TEXT,
  ADD COLUMN "signupLandingPath" TEXT;