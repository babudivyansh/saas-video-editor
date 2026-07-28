-- CreateTable
CREATE TABLE "MarketingEventDaily" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "placement" TEXT NOT NULL,
    "utmSource" TEXT NOT NULL DEFAULT '',
    "utmMedium" TEXT NOT NULL DEFAULT '',
    "utmCampaign" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingEventDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "token" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'blog_footer',
    "utmCampaign" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketingEventDaily_dimensions_key" ON "MarketingEventDaily"("date", "event", "path", "placement", "utmSource", "utmMedium", "utmCampaign");

-- CreateIndex
CREATE INDEX "MarketingEventDaily_date_event_idx" ON "MarketingEventDaily"("date", "event");

-- CreateIndex
CREATE INDEX "MarketingEventDaily_utmCampaign_date_idx" ON "MarketingEventDaily"("utmCampaign", "date");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_email_key" ON "NewsletterSubscriber"("email");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_token_key" ON "NewsletterSubscriber"("token");

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_status_createdAt_idx" ON "NewsletterSubscriber"("status", "createdAt");
