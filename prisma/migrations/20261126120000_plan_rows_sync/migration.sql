-- Bring prod's Plan rows in line with prisma/seed.ts without re-running the
-- seed (which would also re-activate the TOPUP15 coupon, switched off in prod).
--
-- #472 (2026-11-20) renamed Studio -> Agency and the 100-credit pack
-- Starter -> Plus (the free plan is now "Starter"), and retired Lite, but prod
-- was never re-seeded: /pricing showed "Starter" and "Studio" packs and the
-- Lite rows were still active. Prices, credits and minutes already match.
-- Every statement is idempotent; on a fresh database it updates nothing.

UPDATE "Plan" SET "name" = 'Agency (Monthly)' WHERE "slug" = 'sub_studio_1mo';
UPDATE "Plan" SET "name" = 'Agency (Yearly)'  WHERE "slug" = 'sub_studio_12mo';
UPDATE "Plan" SET "name" = 'Plus Pack'        WHERE "slug" = 'pack_starter';
UPDATE "Plan" SET "name" = 'Agency Pack'      WHERE "slug" = 'pack_studio';

-- Lite (₹499) was retired 2026-11-20; nobody had ever bought it.
UPDATE "Plan" SET "active" = false WHERE "slug" IN ('sub_lite_1mo', 'sub_lite_12mo');
