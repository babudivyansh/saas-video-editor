-- The phone's push switches, sent with its token (mobile Phase 7.2).
ALTER TABLE "DeviceToken" ADD COLUMN "pushPrefs" JSONB;
