-- Tracks when the user was last shown their quest rank-reward credit grants,
-- so the dashboard can toast each grant exactly once.
ALTER TABLE "User" ADD COLUMN "rankRewardsSeenAt" TIMESTAMP(3);

-- Backfill: anyone who has already been granted a rank reward earned it before
-- this feature existed. Without this they would be greeted by a burst of
-- toasts announcing months-old grants on their next dashboard load.
UPDATE "User"
   SET "rankRewardsSeenAt" = NOW()
 WHERE array_length("claimedRankRewards", 1) > 0;

-- questRewardClaimed was superseded by claimedRankRewards (added in
-- 20260813120000_add_claimed_rank_rewards) and has had no readers since.
ALTER TABLE "User" DROP COLUMN IF EXISTS "questRewardClaimed";
