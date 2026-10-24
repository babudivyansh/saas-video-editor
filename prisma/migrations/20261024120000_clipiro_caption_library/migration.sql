-- Clipiro caption library (2026-10-24): captions are rendered in-house from
-- 50 Clipiro templates (packages/shared/src/captions/templates.ts); the
-- external caption provider is removed.

-- 1. Retired template ids -> their replacement, so stored clips and brand kits
--    point at a current template. The app also resolves these at runtime
--    (LEGACY_TEMPLATE_ALIASES); this keeps the data itself current.
CREATE TEMP TABLE caption_template_alias (old_id TEXT PRIMARY KEY, new_id TEXT NOT NULL);
INSERT INTO caption_template_alias (old_id, new_id) VALUES
  ('hormozi', 'boardroom'),
  ('podcast', 'studio'),
  ('minimal', 'lowkey'),
  ('neon', 'neontrace'),
  ('news', 'documentary'),
  ('viral-bold-01', 'boardroom'),
  ('viral-bold-02', 'cashflow'),
  ('viral-punch', 'shockwave'),
  ('viral-beast', 'slam'),
  ('high-energy', 'hypestack'),
  ('creator-modern', 'spotlight'),
  ('creator-pop', 'bubblegum'),
  ('podcast-bold', 'studio'),
  ('clean-minimal', 'clean'),
  ('clean-white', 'pill'),
  ('luxury-clean', 'documentary'),
  ('professional-01', 'keynote'),
  ('hormozi-4', 'boardroom'),
  ('matt', 'boardroom'),
  ('caleb', 'boardroom'),
  ('dan', 'boardroom'),
  ('bob', 'boardroom'),
  ('jess', 'shockwave'),
  ('kendrick', 'shockwave'),
  ('devin', 'shockwave'),
  ('karl', 'shockwave'),
  ('jack', 'spotlight'),
  ('lewis', 'spotlight'),
  ('tayo', 'spotlight'),
  ('umi', 'spotlight'),
  ('nick', 'clean'),
  ('doug', 'clean'),
  ('ella', 'clean'),
  ('noah', 'clean'),
  ('laura', 'studio'),
  ('luke', 'studio'),
  ('tracy', 'studio'),
  ('gstaad', 'studio'),
  ('kelly-2', 'documentary'),
  ('mark', 'documentary'),
  ('jason', 'documentary'),
  ('malta', 'documentary'),
  ('claire', 'redbox'),
  ('daniel', 'redbox'),
  ('william', 'redbox'),
  ('nema', 'redbox'),
  ('michael', 'splittone'),
  ('dan-2', 'splittone'),
  ('leon', 'splittone'),
  ('seth', 'splittone');

UPDATE "Clip" c
SET "subtitleStyleOverride" = jsonb_set(c."subtitleStyleOverride"::jsonb, '{templateId}', to_jsonb(a.new_id))
FROM caption_template_alias a
WHERE c."subtitleStyleOverride" IS NOT NULL
  AND jsonb_typeof(c."subtitleStyleOverride"::jsonb) = 'object'
  AND c."subtitleStyleOverride"::jsonb ->> 'templateId' = a.old_id;

UPDATE "BrandKit" b
SET "captionTemplateId" = a.new_id
FROM caption_template_alias a
WHERE b."captionTemplateId" = a.old_id;

DROP TABLE caption_template_alias;

-- 2. Provider-only storage.
ALTER TABLE "CaptionRenderJob" DROP CONSTRAINT "CaptionRenderJob_clipId_fkey";
ALTER TABLE "CaptionRenderJob" DROP CONSTRAINT "CaptionRenderJob_projectId_fkey";
DROP TABLE "CaptionRenderJob";

ALTER TABLE "BrandKit" DROP COLUMN "providerPresetId";

ALTER TABLE "Project" DROP COLUMN "captionRevision",
DROP COLUMN "captionsJson";

ALTER TABLE "User" DROP COLUMN "captionVocabulary";
