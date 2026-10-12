-- Mobile Phase 5.5: a tool job's result, readable from the database.
-- AlterTable
ALTER TABLE "Generation" ADD COLUMN     "result" JSONB,
ADD COLUMN     "resultAssetId" TEXT;

-- AddForeignKey
ALTER TABLE "Generation" ADD CONSTRAINT "Generation_resultAssetId_fkey" FOREIGN KEY ("resultAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
