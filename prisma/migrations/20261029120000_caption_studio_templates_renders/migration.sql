-- Caption Studio (2026-10-29): saved caption looks, and one row per ratio of
-- a multi-ratio export. Two new tables, no change to any existing one, so this
-- is additive and safe to apply ahead of the code that reads it.

CREATE TABLE "UserCaptionTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseTemplateId" TEXT NOT NULL,
    "style" JSONB NOT NULL DEFAULT '{}',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCaptionTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectRender" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "aspect" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "s3Key" TEXT,
    "failureReason" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectRender_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserCaptionTemplate_userId_idx" ON "UserCaptionTemplate"("userId");

CREATE INDEX "ProjectRender_projectId_createdAt_idx" ON "ProjectRender"("projectId", "createdAt");
CREATE INDEX "ProjectRender_batchId_idx" ON "ProjectRender"("batchId");
CREATE INDEX "ProjectRender_status_updatedAt_idx" ON "ProjectRender"("status", "updatedAt");

ALTER TABLE "UserCaptionTemplate" ADD CONSTRAINT "UserCaptionTemplate_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectRender" ADD CONSTRAINT "ProjectRender_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same lockdown as 20261028120000_rls_lockdown: Prisma connects as the owner
-- (BYPASSRLS); Supabase's anon/authenticated roles get no rows. Default
-- privileges already withhold grants on new tables.
ALTER TABLE "UserCaptionTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectRender" ENABLE ROW LEVEL SECURITY;
