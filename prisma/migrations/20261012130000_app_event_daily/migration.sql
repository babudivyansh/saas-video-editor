-- The Android app's first-party analytics (mobile Phase 15): daily counts
-- per event and app version. No user or device id.
CREATE TABLE "AppEventDaily" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "appVersion" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppEventDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppEventDaily_date_event_appVersion_key" ON "AppEventDaily"("date", "event", "appVersion");
