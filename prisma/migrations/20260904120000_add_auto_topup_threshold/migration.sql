-- Auto-topup previously fired at a single hardcoded 10-credit threshold for
-- every user (lib/credits.ts's AUTO_TOPUP_THRESHOLD). Making it per-user
-- (bounded to [5, 100] in app/api/billing/auto-topup/route.ts) needs a column
-- to hold that choice. DEFAULT 10 backfills every existing row to the exact
-- threshold they already had, so this is a no-op for behavior until a user
-- actually changes it in Settings > Billing.
ALTER TABLE "User" ADD COLUMN "autoTopupThreshold" INTEGER NOT NULL DEFAULT 10;
