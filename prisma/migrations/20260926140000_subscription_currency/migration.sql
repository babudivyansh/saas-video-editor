-- The currency a recurring subscription is billed in, so billing screens and
-- emails quote the real charge instead of the viewer's locale currency.
-- Nullable: existing rows fall back to their latest plan Purchase.currency.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "subscriptionCurrency" TEXT;

