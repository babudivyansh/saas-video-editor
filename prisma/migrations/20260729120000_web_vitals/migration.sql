-- CreateTable
CREATE TABLE "WebVitalDaily" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WebVitalDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebVitalDaily_dimensions_key" ON "WebVitalDaily"("date", "metric", "path", "bucket");

-- CreateIndex
CREATE INDEX "WebVitalDaily_date_metric_idx" ON "WebVitalDaily"("date", "metric");
