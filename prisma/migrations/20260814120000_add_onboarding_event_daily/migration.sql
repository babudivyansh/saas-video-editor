-- CreateTable
CREATE TABLE "OnboardingEventDaily" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingEventDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingEventDaily_date_event_key" ON "OnboardingEventDaily"("date", "event");
