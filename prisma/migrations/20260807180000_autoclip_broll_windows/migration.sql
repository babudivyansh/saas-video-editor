-- AlterTable: Clip — keyword-driven, multi-window B-roll.
--
-- Previously each clip got at most ONE stock insert, placed at an offset the
-- model guessed. This stores up to a few windows, each anchored to the word
-- the speaker actually says, as [{startSec, endSec, url, query}].
--
-- The single brollUrl/brollStartSec/brollEndSec columns are kept: clips picked
-- before this column existed still render from them.
ALTER TABLE "Clip" ADD COLUMN "brollWindows" JSONB;
