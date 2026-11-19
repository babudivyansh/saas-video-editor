-- Multi-provider email delivery (2026-11-19). Additive only: six new tables,
-- nothing existing is altered or dropped.
-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "provider" TEXT,
    "providerMessageId" TEXT,
    "idempotencyKey" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "latencyMs" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "payloadEncrypted" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAttempt" (
    "id" TEXT NOT NULL,
    "emailMessageId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "attemptNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "errorClass" TEXT,
    "errorCode" TEXT,
    "sanitizedErrorMessage" TEXT,
    "latencyMs" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "EmailAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailProviderStatus" (
    "provider" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL,
    "dailyLimit" INTEGER,
    "monthlyLimit" INTEGER,
    "healthStatus" TEXT NOT NULL DEFAULT 'unknown',
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "circuitBreakerUntil" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "reportedRemaining" INTEGER,
    "reportedAt" TIMESTAMP(3),
    "senderVerified" BOOLEAN,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailProviderStatus_pkey" PRIMARY KEY ("provider")
);

-- CreateTable
CREATE TABLE "EmailQuotaUsage" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "periodType" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "configuredLimit" INTEGER,
    "reservedCount" INTEGER NOT NULL DEFAULT 0,
    "acceptedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "exhaustedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailQuotaUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "occurredAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,

    CONSTRAINT "EmailWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAlert" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "provider" TEXT,
    "message" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "EmailAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_idempotencyKey_key" ON "EmailMessage"("idempotencyKey");

-- CreateIndex
CREATE INDEX "EmailMessage_createdAt_idx" ON "EmailMessage"("createdAt");

-- CreateIndex
CREATE INDEX "EmailMessage_status_createdAt_idx" ON "EmailMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EmailMessage_provider_createdAt_idx" ON "EmailMessage"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "EmailMessage_templateId_createdAt_idx" ON "EmailMessage"("templateId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailMessage_recipientEmail_createdAt_idx" ON "EmailMessage"("recipientEmail", "createdAt");

-- CreateIndex
CREATE INDEX "EmailMessage_providerMessageId_idx" ON "EmailMessage"("providerMessageId");

-- CreateIndex
CREATE INDEX "EmailMessage_status_nextAttemptAt_idx" ON "EmailMessage"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "EmailAttempt_emailMessageId_idx" ON "EmailAttempt"("emailMessageId");

-- CreateIndex
CREATE INDEX "EmailAttempt_provider_startedAt_idx" ON "EmailAttempt"("provider", "startedAt");

-- CreateIndex
CREATE INDEX "EmailAttempt_providerMessageId_idx" ON "EmailAttempt"("providerMessageId");

-- CreateIndex
CREATE INDEX "EmailQuotaUsage_periodStart_idx" ON "EmailQuotaUsage"("periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "EmailQuotaUsage_provider_periodType_periodStart_key" ON "EmailQuotaUsage"("provider", "periodType", "periodStart");

-- CreateIndex
CREATE INDEX "EmailWebhookEvent_receivedAt_idx" ON "EmailWebhookEvent"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailWebhookEvent_provider_eventKey_key" ON "EmailWebhookEvent"("provider", "eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "EmailAlert_dedupeKey_key" ON "EmailAlert"("dedupeKey");

-- CreateIndex
CREATE INDEX "EmailAlert_resolvedAt_lastAt_idx" ON "EmailAlert"("resolvedAt", "lastAt");

-- AddForeignKey
ALTER TABLE "EmailAttempt" ADD CONSTRAINT "EmailAttempt_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
