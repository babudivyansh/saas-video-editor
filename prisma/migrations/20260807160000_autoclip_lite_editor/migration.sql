-- AlterTable: Clip — inline lite-editor state.
--
-- liteEdits  : versioned JSON blob for speed / music bed / B-roll swap /
--              transitions, following the same per-feature-blob pattern as
--              subtitleStyleOverride and silenceSettings. Trim stays in the
--              startSec/endSec columns on purpose.
-- audioPeaks : downsampled waveform for the scrubber, computed server-side
--              during render so the browser never decodes the source.
-- renderTarget: "cpu" | "gpu", for ops visibility into where clips encoded.
ALTER TABLE "Clip" ADD COLUMN "liteEdits" JSONB;
ALTER TABLE "Clip" ADD COLUMN "audioPeaks" JSONB;
ALTER TABLE "Clip" ADD COLUMN "renderTarget" TEXT;
