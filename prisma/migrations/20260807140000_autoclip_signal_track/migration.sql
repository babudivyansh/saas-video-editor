-- AlterTable: Clip — per-clip speech signal track.
-- Loudness/pitch/energy envelopes plus shot boundaries and pauses, computed
-- during analysis and used at render time to drive energy-reactive zoom and
-- caption animation. Nullable: clips picked before this existed simply render
-- with the non-reactive behaviour.
ALTER TABLE "Clip" ADD COLUMN "signalTrack" JSONB;
