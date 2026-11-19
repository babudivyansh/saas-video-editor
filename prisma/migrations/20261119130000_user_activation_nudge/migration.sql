-- 1-hour activation nudge flag (2026-11-19). Nullable, additive.

ALTER TABLE "User" ADD COLUMN "activationNudgeSentAt" TIMESTAMP(3);
