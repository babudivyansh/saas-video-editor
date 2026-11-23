-- Read-only demo projects on Home (lib/demo-projects.ts): a finished AutoClip
-- run marked with the sample video it was made from.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "demoSlug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Project_demoSlug_key" ON "Project"("demoSlug");
