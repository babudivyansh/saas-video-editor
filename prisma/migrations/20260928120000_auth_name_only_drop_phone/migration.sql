-- Auth hardening (2026-09-28): one display name instead of first/last, no
-- phone number, and a flag for accounts whose owner has never known a password.
--
-- Order matters: both backfills read columns this migration then drops.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "hasPassword" BOOLEAN NOT NULL DEFAULT true;

-- Keep whatever name the account already had; otherwise build it from the
-- old first/last pair. Rows with neither stay NULL (the UI falls back to the
-- email's local part).
UPDATE "User"
SET "name" = COALESCE(
  NULLIF(TRIM("name"), ''),
  NULLIF(TRIM(CONCAT_WS(' ', "firstName", "lastName")), '')
);

-- Password signup always required a phone and Google signup never set one,
-- so a NULL phone is the best available marker of a Google-created account
-- (random password hash its owner never saw). A wrong guess is harmless:
-- that user confirms sensitive actions with an emailed code instead, and
-- reset-password sets the flag back to true.
UPDATE "User" SET "hasPassword" = false WHERE "phone" IS NULL;

-- DropIndex
DROP INDEX "User_phone_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "firstName",
DROP COLUMN "lastName",
DROP COLUMN "phone";
