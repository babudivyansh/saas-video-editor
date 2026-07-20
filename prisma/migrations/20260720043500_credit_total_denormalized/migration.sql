-- "credits" becomes the denormalized TOTAL (= bonus + subscription +
-- purchased), maintained by lib/credits.ts in the same statement as every
-- bucket mutation. Restore it after the bucket-split migration zeroed it.
UPDATE "User" SET "credits" = "bonusCredits" + "subscriptionCredits" + "purchasedCredits";
