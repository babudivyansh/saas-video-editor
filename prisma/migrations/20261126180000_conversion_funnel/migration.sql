-- Conversion plan 2026-11-26: email open/click tracking and the
-- free-minutes expiry reminder guard. Additive, nullable: safe on a live DB.
ALTER TABLE "User" ADD COLUMN "minutesExpiryReminderFor" TIMESTAMP(3);
ALTER TABLE "EmailMessage" ADD COLUMN "openedAt" TIMESTAMP(3);
ALTER TABLE "EmailMessage" ADD COLUMN "clickedAt" TIMESTAMP(3);
