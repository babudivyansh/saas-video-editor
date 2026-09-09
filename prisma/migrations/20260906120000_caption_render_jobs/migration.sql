-- Premium caption rendering through an external provider (lib/captions).
--
-- One new table, no changes to any existing one, so this is additive and safe
-- to apply ahead of the code that reads it. The feature is additionally gated
-- behind the `submagic_enabled` feature flag, which is off until the provider
-- credentials are configured.
--
-- "provider" + "providerProjectId" is the entire coupling to Submagic. Nothing
-- else in the schema names it, which is what lets a later provider swap (or
-- Clipiro's own animated renderer) reuse this table unchanged.

CREATE TABLE "CaptionRenderJob" (
    "id" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "userId" TEXT,
    "refId" TEXT,
    "provider" TEXT NOT NULL,
    "providerProjectId" TEXT,
    "templateId" TEXT NOT NULL,
    "providerTemplate" TEXT,
    "language" TEXT NOT NULL DEFAULT 'auto',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "captionRevision" INTEGER NOT NULL DEFAULT 0,
    "captionPositionX" DOUBLE PRECISION,
    "captionPositionY" DOUBLE PRECISION,
    "hookEnabled" BOOLEAN NOT NULL DEFAULT false,
    "hook" JSONB,
    "sourceDurationSec" DOUBLE PRECISION,
    "estimatedCredits" INTEGER,
    "actualCredits" INTEGER,
    "providerBillableSec" INTEGER,
    "providerCostMicroUsd" INTEGER,
    "requestPayload" JSONB,
    "providerResponse" JSONB,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT,
    "outputAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaptionRenderJob_pkey" PRIMARY KEY ("id")
);

-- The provider's id for the render. UNIQUE because a webhook arrives carrying
-- only this, and two rows sharing one would make the callback ambiguous.
CREATE UNIQUE INDEX "CaptionRenderJob_providerProjectId_key" ON "CaptionRenderJob"("providerProjectId");

-- The double-charge guard. A second render with identical inputs cannot be
-- inserted, so a double-clicked Export is stopped by the database rather than
-- by application timing.
CREATE UNIQUE INDEX "CaptionRenderJob_idempotencyKey_key" ON "CaptionRenderJob"("idempotencyKey");

CREATE INDEX "CaptionRenderJob_clipId_idx" ON "CaptionRenderJob"("clipId");
CREATE INDEX "CaptionRenderJob_userId_status_idx" ON "CaptionRenderJob"("userId", "status");
-- The reconciliation sweep's scan: non-terminal rows, oldest first.
CREATE INDEX "CaptionRenderJob_status_updatedAt_idx" ON "CaptionRenderJob"("status", "updatedAt");
-- Admin spend/latency charts bucket by day across all users, so they need a
-- standalone date index rather than a composite whose second column is the date
-- (Postgres cannot seek into a composite B-tree on its second column).
CREATE INDEX "CaptionRenderJob_createdAt_idx" ON "CaptionRenderJob"("createdAt");

ALTER TABLE "CaptionRenderJob" ADD CONSTRAINT "CaptionRenderJob_clipId_fkey"
    FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
