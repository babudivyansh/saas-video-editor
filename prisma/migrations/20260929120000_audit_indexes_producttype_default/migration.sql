-- Audit 2026-09-29: indexes for foreign keys that are filtered on alone, and a
-- Project.productType default that no longer names a removed product.

-- Admin plan-level subscriber counts filter on planId.
CREATE INDEX "User_planId_idx" ON "User"("planId");

-- Purchase history, account deletion and admin user views filter by user.
CREATE INDEX "Purchase_userId_createdAt_idx" ON "Purchase"("userId", "createdAt");

-- onDelete: SetNull on Asset.sourceProjectId / sourceClipId looks rows up by
-- the FK alone; the existing (userId, …) composites can't serve that, so every
-- Project/Clip delete scanned the Asset table.
CREATE INDEX "Asset_sourceProjectId_idx" ON "Asset"("sourceProjectId");
CREATE INDEX "Asset_sourceClipId_idx" ON "Asset"("sourceClipId");

-- "split-screen" was removed 2026-09-10. Only the column default changes;
-- existing rows keep whatever they were created as.
ALTER TABLE "Project" ALTER COLUMN "productType" SET DEFAULT 'auto-clip';
