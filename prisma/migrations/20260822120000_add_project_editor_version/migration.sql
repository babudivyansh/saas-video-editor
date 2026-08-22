-- AlterTable: optimistic-concurrency support for the manual editor's autosave
-- (P0-5 release-gate fix). `editorVersion` is bumped by one on every
-- successful editorDoc PATCH; a mismatched version on write means a newer
-- save already landed elsewhere, and the request is rejected with 409
-- instead of silently overwriting it. `updatedAt` is a byproduct (lets
-- projects be sorted by "recently edited", which was previously impossible).
--
-- IF NOT EXISTS guards make this safe to re-run: this exact addition was
-- already applied ad hoc to at least one shared local dev database outside
-- of a tracked migration (confirmed via information_schema during this
-- fix's investigation) — this migration is the first one to actually commit
-- it to source control, and must not fail on a database where the columns
-- already happen to exist.
-- `updatedAt` uses a temporary DEFAULT CURRENT_TIMESTAMP only to satisfy
-- NOT NULL while backfilling existing rows, then drops it — Prisma's
-- `@updatedAt` is application-managed (the client sets it on every write) and
-- expects no DB-level default going forward. Confirmed against `prisma
-- migrate diff --exit-code` (the same check CI runs) on a from-scratch
-- database: this two-step form produces zero drift against schema.prisma,
-- whereas leaving the default in place does not.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Project" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "editorVersion" INTEGER NOT NULL DEFAULT 1;
