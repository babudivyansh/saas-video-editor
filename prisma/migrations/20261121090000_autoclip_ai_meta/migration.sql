-- AutoClip AI B-roll and reframing (2026-11-21). Additive only: three nullable
-- columns, nothing existing is altered or dropped.

-- AlterTable
ALTER TABLE "Clip" ADD COLUMN "aiMeta" JSONB;

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "aiEmbedding" JSONB,
ADD COLUMN "aiEmbeddingModel" TEXT;
