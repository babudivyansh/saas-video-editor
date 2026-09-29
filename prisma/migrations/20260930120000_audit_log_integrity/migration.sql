-- Audit log redesign 2026-09-30: first-class who/where fields, the actor's
-- kind, and a SHA-256 hash chain so an edited or deleted row is detectable.
-- All nullable: rows written before this keep their reason/ip inside
-- after._meta and have no hash — the viewer labels them "legacy".

ALTER TABLE "AuditLog" ADD COLUMN "actorType" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "reason" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "ip" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "hash" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "prevHash" TEXT;

-- Per-entity history ("everything done to this account").
CREATE INDEX "AuditLog_targetId_createdAt_idx" ON "AuditLog"("targetId", "createdAt");
