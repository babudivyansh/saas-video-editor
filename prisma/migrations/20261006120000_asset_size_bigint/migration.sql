-- Asset.size was int4 (max 2,147,483,647 bytes), but Pro allows 2 GiB and Studio
-- 5 GiB uploads, so a large upload landed in S3 and then failed the Asset insert
-- with P2020. int4 -> int8 is a widening cast; existing values carry over as-is.
-- AlterTable
ALTER TABLE "Asset" ALTER COLUMN "size" SET DATA TYPE BIGINT;
