-- AlterTable: Project — surface why an Auto Clip run failed.
-- The pick/render jobs already throw user-appropriate messages ("Video is too
-- short…", "…your plan supports Auto Clips up to 30 min"), but they were only
-- ever logged: the client saw status="failed" and rendered a generic string.
-- Nullable and unbacked by a default, so existing rows are untouched.
ALTER TABLE "Project" ADD COLUMN "failureReason" TEXT;
