-- A failed scheduled publish used to record its reason inside metricsJson.
-- That column belongs to the social-metrics refresh (lib/social/refresh-queue
-- rewrites it wholesale, and score-performance reads "views" out of it), so the
-- reason was both destroyed on the next sync and, until then, indistinguishable
-- to those consumers from a post that simply had no metrics yet.
ALTER TABLE "ClipPublish" ADD COLUMN "failureReason" TEXT;

-- Recover any reasons still sitting in metricsJson from before the split, then
-- clear them so the metrics consumers see an empty snapshot rather than an
-- object with a failureReason key they don't understand.
UPDATE "ClipPublish"
   SET "failureReason" = "metricsJson"->>'failureReason',
       "metricsJson" = NULL
 WHERE "metricsJson" ? 'failureReason';
