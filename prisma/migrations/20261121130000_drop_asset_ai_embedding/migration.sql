-- Stock B-roll was removed from AutoClip (2026-11-21), and with it the search
-- of a creator's own library that these embeddings were for. They were only
-- ever filled when that (default-off) feature ran, so nothing of value is lost.

-- AlterTable
ALTER TABLE "Asset" DROP COLUMN "aiEmbedding",
DROP COLUMN "aiEmbeddingModel";
