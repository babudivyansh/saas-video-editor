-- One-per-person offers (signup bonus, Pro trial) key on the inbox, not the
-- spelling: see lib/email-canonical.ts. Backfilled with the same rule — lower
-- case, "+tag" dropped, dots dropped for Gmail/Googlemail.

ALTER TABLE "User" ADD COLUMN "canonicalEmail" TEXT;

UPDATE "User"
SET "canonicalEmail" = CASE
  WHEN lower(split_part(email, '@', 2)) IN ('gmail.com', 'googlemail.com')
    THEN replace(split_part(split_part(lower(email), '@', 1), '+', 1), '.', '') || '@gmail.com'
  ELSE split_part(split_part(lower(email), '@', 1), '+', 1) || '@' || lower(split_part(email, '@', 2))
END
WHERE email LIKE '%@%';

CREATE INDEX "User_canonicalEmail_idx" ON "User"("canonicalEmail");
