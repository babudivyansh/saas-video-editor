-- Same lockdown as 20261028120000_rls_lockdown, for the six email-router
-- tables added by 20261119160000_email_multi_provider (which shipped without
-- it and is already applied, so it can't be edited). Prisma connects as the
-- owner (BYPASSRLS); Supabase's anon/authenticated roles get no rows.
ALTER TABLE "EmailMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailProviderStatus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailQuotaUsage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailWebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailAlert" ENABLE ROW LEVEL SECURITY;
