# Web launch runbook (clipiro.com, 8 Nov 2026)

What to do before, during and after the public launch. It covers the web app;
the Android release has its own checklist in `docs/mobile/RELEASE.md`. Source:
the pre-launch audit of 23 Oct 2026 and the fix PRs that followed it.

Each step says how to check it, because most launch failures here have been
silent: a cron that never ran, a webhook the proxy 401'd, a key that was unset.

## 1. Before launch day (by 6 Nov)

### Accounts and switches only a person can flip

- [ ] **AWS: make the media bucket private.** Follow
      `docs/ops/s3-private-bucket.md`: turn on Block Public Access, add the
      1-day lifecycle rule on `exports/`, then check that a plain object URL
      returns 403.
- [ ] **Razorpay: switch to Live.**
  1. Create the Live webhook pointing at `https://clipiro.com/api/webhooks/razorpay`.
  2. Put its secret in `RAZORPAY_WEBHOOK_SECRET`, and the Live key and secret in `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
  3. Run `npm run db:seed` and recreate the plans on the Live account (Admin → Pricing → sync each plan). Test-mode plan ids don't exist in Live.
  4. Make one real purchase and refund it.
- [ ] **Admin 2FA.** Every ADMIN turns on two-factor authentication in
      Settings → Security. The admin console refuses to open without it (#376).
- [ ] **Rotate any secret that was ever pasted into chat or a ticket.**
      `CRON_SECRET` was, during the cron-tick setup. Update cron-job.org afterwards.
- [ ] **Upgrade the ElevenLabs plan.** The free tier is 10k characters a month,
      which one busy day of AutoClip transcription uses up.
- [ ] **ipinfo token (optional).** Create a free Lite token and set
      `IPINFO_TOKEN` if you want countries on login history and sign-in alerts.

### Production environment (Hostinger → Node.js app → environment)

- [ ] Required at boot: `DATABASE_URL`, `JWT_SECRET` (at least 32 characters),
      `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_REGION`,
      `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
- [ ] Required in practice:
  - Data and sessions: `REDIS_URL`.
  - Email: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM`.
  - AutoClip: `ELEVENLABS_API_KEY`, `GEMINI_API_KEY`.
  - Cron: `CRON_SECRET`, `SOCIAL_REFRESH_SECRET`, `ASSET_CLEANUP_SECRET`.
  - Social Tracker: `SOCIAL_TOKEN_KEY`.
  - App URL: `NEXT_PUBLIC_APP_URL=https://clipiro.com`.
- [ ] Monitoring: `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`. Without them Sentry
      is wired but sends nothing.
- [ ] `AUDIT_HMAC_KEY` set explicitly. If it isn't, it's derived from
      `JWT_SECRET`, so rotating that secret later breaks the audit chain.

### Schedulers and monitors

- [ ] **cron-job.org** calls `GET https://clipiro.com/api/cron-tick` every minute
      with `Authorization: Bearer $CRON_SECRET`. Check that Admin → Ops shows
      the last tick within the last few minutes.
- [ ] **Uptime monitor** (UptimeRobot, Better Stack, or similar) on
      `https://clipiro.com/api/health`. It returns 503 when the database or
      Redis is down. Alert by email or phone.

## 2. Deploy

Production builds from `main`. Hostinger also builds a preview for every pull
request, shown in the PR comments.

1. Merge the release PRs into `main` and wait for **CI to go green on `main`**.
2. Deploy. `npm run build` runs `prisma migrate deploy` first, so pending
   migrations apply as part of the build. If Hostinger isn't building from Git,
   follow the manual steps in `SETUP.md` §6: pull, install, build, restart.
3. Check the build log for `All migrations have been successfully applied` and
   no `Failed to compile`.

## 3. Smoke test right after deploy (about 15 minutes)

Use a real browser and a fresh account. Logged-in checks catch what curl can't.

- [ ] `/api/health` returns `{"status":"ok"}`.
- [ ] Home page: the film plays, the CTA works, and the footer shows the legal entity and GSTIN.
- [ ] Sign up with email, receive the code, and land on the dashboard. Repeat with Google.
- [ ] AutoClip: upload a short video, the run completes, a clip plays, and the download works.
- [ ] Pricing: start a Live checkout and pay. The plan shows up on the account, and the invoice email arrives with the GST breakdown. Then refund it from Admin → Purchases.
- [ ] Admin: sign in to `/admin`. It asks for the emailed code and the authenticator code.
- [ ] Sentry: open a page that throws (or use Sentry's test event) and see it arrive.
- [ ] After a few minutes, Admin → Ops shows the cron jobs ticking.

## 4. Launch day watch

- Keep Sentry, the uptime monitor and Admin → Ops open. The things to watch:
  - render queue depth;
  - cron last-run times;
  - email failures;
  - ElevenLabs and fal.ai balances.
- Render workers run inside the web process (`RENDER_CONCURRENCY`, default 2).
  If page loads slow down while AutoClip is busy, lower it rather than raising it.
- The anonymous free tools are capped at 20 jobs per minute site-wide. A 503
  saying "free tools are busy" means the cap is working.

## 5. Rollback

- **Code:** redeploy the previous good commit from `main` (revert the merge commit and push, or deploy the earlier commit in Hostinger).
- **Migrations are forward-only.** The recent ones are additive (new tables,
  nullable columns, indexes), so the previous code runs against the newer schema.
  Don't try to roll back the database.
- **Payments misbehaving:** Admin → Ops → Flags → maintenance mode blocks every
  non-admin API call with your message while you fix it.
  `/api/health` and the admin routes stay reachable.
