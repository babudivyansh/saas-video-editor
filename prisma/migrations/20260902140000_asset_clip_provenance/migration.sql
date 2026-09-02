-- Asset/Clip/Project provenance: turn the dangling provenance strings into
-- real relations so the Related Content panels can traverse the graph.
--
-- Ordering matters here. Asset.sourceProjectId already exists as a plain TEXT
-- column with live data and NO foreign key, so some values are guaranteed not
-- to reference a real Project: the AI Creator route wrote a process-local
-- randomUUID() into sourceJobId/sourceProjectId keyed to an in-memory Map, and
-- projects deleted since the column was added left their ids behind. Adding
-- the constraint before clearing those rows would abort the migration.

-- 1. New columns (all nullable — online-safe, no table rewrite).
ALTER TABLE "Asset" ADD COLUMN "sourceClipId" TEXT;
ALTER TABLE "Project" ADD COLUMN "sourceAssetId" TEXT;
ALTER TABLE "Clip" ADD COLUMN "sourceAssetId" TEXT;
ALTER TABLE "Clip" ADD COLUMN "failureReason" TEXT;

-- 2. Clear dangling sourceProjectId values so the FK below can be created.
--    These pointers were already unusable; this makes that explicit rather
--    than leaving them to fail at constraint-creation time.
UPDATE "Asset"
   SET "sourceProjectId" = NULL
 WHERE "sourceProjectId" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "Project" p WHERE p."id" = "Asset"."sourceProjectId");

-- 3. Foreign keys. All ON DELETE SET NULL: provenance is a breadcrumb, so
--    deleting a project or clip must never cascade into deleting the user's
--    media, and must never block the delete either.
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_sourceProjectId_fkey"
  FOREIGN KEY ("sourceProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_sourceClipId_fkey"
  FOREIGN KEY ("sourceClipId") REFERENCES "Clip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Project" ADD CONSTRAINT "Project_sourceAssetId_fkey"
  FOREIGN KEY ("sourceAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Clip" ADD CONSTRAINT "Clip_sourceAssetId_fkey"
  FOREIGN KEY ("sourceAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Indexes.
CREATE INDEX "Asset_userId_sourceClipId_idx" ON "Asset"("userId", "sourceClipId");
CREATE INDEX "Project_sourceAssetId_idx" ON "Project"("sourceAssetId");
CREATE INDEX "Clip_sourceAssetId_idx" ON "Clip"("sourceAssetId");

-- Every clip list in the app orders by score DESC, index ASC. That sort has
-- been unindexed since clips were introduced.
CREATE INDEX "Clip_projectId_score_idx" ON "Clip"("projectId", "score");
