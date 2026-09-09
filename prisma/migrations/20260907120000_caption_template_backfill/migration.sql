-- Move existing clips off the retired integer caption-style index and onto
-- template slugs, and retire the "pending_review" status.
--
-- Two independent changes, one migration because they touch the same rows.

-- ── 1. Backfill Clip.subtitleStyleOverride.templateId ──────────────────────
--
-- AutoClip used to pick captions from 16 font/colour permutations selected by
-- ARRAY INDEX (the deleted lib/caption-styles.ts). Those indices are meaningless
-- to the new template-based renderer, so each one is mapped to the template it
-- most closely resembles. The mapping mirrors INDEX_TO_TEMPLATE in
-- lib/captions/legacyStyleIndex.ts — keep the two in step if either changes.
--
-- captionStyleIndex is deliberately NOT dropped: it is still the base style
-- styleIndexToSubtitleStyle() spreads a template's values on top of, it is still
-- part of the public v1 API contract, and it is how already-rendered clips keep
-- looking the way they look.
--
-- Only rows that have no templateId yet are touched, so this is idempotent and
-- never overwrites a choice the user has since made in the Studio drawer.
UPDATE "Clip"
SET "subtitleStyleOverride" = COALESCE("subtitleStyleOverride", '{}'::jsonb)
  || jsonb_build_object('templateId', CASE
       WHEN "captionStyleIndex" IN (7, 10, 13) THEN 'hormozi'
       WHEN "captionStyleIndex" IN (2, 3, 12)  THEN 'news'
       WHEN "captionStyleIndex" IN (1, 9)      THEN 'podcast'
       WHEN "captionStyleIndex" IN (6, 15)     THEN 'neon'
       ELSE 'clean'
     END)
WHERE "captionStyleIndex" IS NOT NULL
  AND "captionStyleIndex" >= 0
  AND ("subtitleStyleOverride" IS NULL
       OR NOT ("subtitleStyleOverride" ? 'templateId'));

-- ── 2. Retire "pending_review" ─────────────────────────────────────────────
--
-- The review step (pick clips, then confirm and pay for the ones you keep) was
-- removed: a run is priced and charged up front at Generate and every clip
-- renders. Nothing produces this status any more, and no code path reads it, so
-- any row still sitting in it would be stranded in a state the UI cannot render
-- and the pipeline will never advance.
--
-- Clips move to "queued", which renderJob already selects on, and their projects
-- to "rendering" so the render actually gets picked up.
--
-- NOTE: these runs were never charged for rendering — under the old flow that
-- happened at confirm, which they never reached. They are being completed for
-- free rather than being deleted, which is the kinder failure for a user who
-- has been waiting on them; the volume is small enough for that to be the right
-- trade. Change the UPDATE to a DELETE if that is not acceptable.
UPDATE "Clip" SET "status" = 'queued' WHERE "status" = 'pending_review';
UPDATE "Project" SET "status" = 'rendering' WHERE "status" = 'pending_review';
