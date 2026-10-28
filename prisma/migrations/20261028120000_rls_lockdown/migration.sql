-- Lock Supabase's Data API (PostgREST) out of every table.
--
-- The app reaches Postgres only through Prisma, connected as `postgres` (table
-- owner, BYPASSRLS), and never uses the Supabase client. But Supabase exposes
-- the `public` schema over REST to the `anon` and `authenticated` roles, and
-- they had been granted SELECT/INSERT/UPDATE/DELETE/TRUNCATE on all 72 tables:
-- anyone holding the project URL and the (public by design) anon key could
-- read every user's email, password hash and 2FA secret, or make themselves
-- admin. Advisor lint `rls_disabled_in_public`, 2026-10-28.
--
-- Enabling RLS with no policies denies those roles every row; revoking the
-- grants removes table access outright. Both are idempotent, and `postgres`
-- bypasses RLS, so Prisma is unaffected. The role statements are guarded
-- because plain Postgres (local dev, CI) has no `anon`/`authenticated` roles.

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    -- Tables later migrations create (as this same role) start locked too.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  END IF;
END $$;
