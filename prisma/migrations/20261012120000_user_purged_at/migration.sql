-- Account deletion for customers with billing history (2026-10-12): the User
-- row is kept as an anonymised tombstone so Purchase/Invoice foreign keys stay
-- valid, and purgedAt marks it. Nullable, no backfill.

ALTER TABLE "User" ADD COLUMN "purgedAt" TIMESTAMP(3);
