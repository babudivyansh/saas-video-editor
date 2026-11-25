# Multi-provider transactional email (Brevo → Mailjet → Resend)

Added 2026-11-19 after Resend's free quota ran out and every email stopped.
Code: `lib/email/router/`. Admin: **/admin/email**.

## How it fits

Every email in the app already goes through one function — `sendTemplate()` in
`lib/email/send.ts` (via the `lib/email.ts` facade). The router plugs in there,
so templates, subjects, sender name, unsubscribe handling, opt-outs,
suppression and the OTP flow are unchanged.

```
sendTemplate()  ── suppression / opt-out / render (unchanged)
   │
   ├─ EMAIL_ROUTER_ENABLED=true and ≥1 provider configured
   │     deliver()  → EmailMessage row
   │       routeEmail(): for each enabled provider in priority order
   │         skip: no credentials · suspended · circuit open · no quota slot
   │         send once →  accepted ............ done
   │                      bad recipient ...... stop (every provider would refuse)
   │                      unknown outcome .... stop (may have been sent — no duplicate)
   │                      anything else ...... mark provider, try next
   │       none left → critical: fail now · other: hold (encrypted) and retry
   │
   └─ flag off → the old path: Resend, then SMTP  (this is the rollback)
```

Priorities: **critical** = `otp`, `password-reset`, `verify-email`,
`change-email-confirm` (never deferred; 10% of each daily quota is reserved for
them). **high** = security alerts + billing. **normal** = everything else.

## Error handling per provider

| Class | Examples | Router does |
|---|---|---|
| quota | Brevo `not_enough_credits`/402, Resend `daily_quota_exceeded`/`monthly_quota_exceeded` | marks the period exhausted, falls back |
| rate_limit | 429 | cooldown (Retry-After or 60 s), falls back |
| auth / sender_config | bad key, unverified sender/domain | provider "misconfigured" for 1 h or until a probe passes, falls back, critical alert |
| suspended | Resend `suspended_api_key`, account suspended | out until an admin clears it (reason required); never auto-recovered |
| transient | 5xx, DNS/connection refused | 3 in a row → circuit open 5 min, then one trial send |
| unknown_outcome | timeout/reset after the request may have arrived, 502/504 | **stops** — no second provider. Resend only: one retry on Resend with the same `Idempotency-Key` |
| recipient | invalid address | stops, message failed, provider health untouched |

An unknown outcome is settled later by the provider's own webhook (Brevo
`request`, Resend `email.sent`, Mailjet `sent`), matched by our message id
(Brevo tag `msg:<id>`, Mailjet `CustomID`, Resend tag).

## Quotas

Limits are configuration (Admin → Email → Providers). Defaults for a fresh
database are each provider's free plan as published on 2026-11-19 — verify
against your own account:

| Provider | Daily | Monthly | Source |
|---|---|---|---|
| Brevo | 300 | — | help.brevo.com/hc/en-us/articles/208580669 |
| Mailjet | 200 | 6,000 | mailjet.com/pricing |
| Resend | 100 | 3,000 | resend.com/docs/knowledge-base/account-quotas-and-limits |

Reservation is one conditional `INSERT … ON CONFLICT DO UPDATE … WHERE
reservedCount < cap` per period, so concurrent sends cannot share the last slot
(`lib/email/router/quota.race.test.ts` proves it on Postgres). Periods are UTC;
Resend documents a UTC-midnight reset, Brevo/Mailjet don't publish one, so
their counts are labelled **estimated**. Mailjet's free plan *queues* over-quota
mail until the next day instead of refusing it — the reservation stops at the
configured limit so a code is never queued there.

### Marketing campaigns (Admin → Campaigns)

HTML campaigns (`lib/campaigns/`) go through this same router as template
`campaign` (category `marketingEmails`: opt-out honoured, one-click
unsubscribe). They are sent by `/api/cron/email-campaigns` every 2 minutes in
batches of at most 60, and a batch only spends quota that is **spare**: what
usable providers have left today minus 40% of their combined daily allowance,
which stays reserved for codes, receipts and alerts. On top of that an
admin-set daily cap applies (default 100, Config key
`email_campaign_daily_cap`; with the router off the cap is the only limit, so
keep it at or under Resend's 100/day). A large audience simply carries over to
the next UTC day. Every recipient row is claimed before its send and the send
carries the idempotency key `campaign:<campaignId>:<userId>`, so overlapping
or retried runs never mail anyone twice.

## Environment variables (Hostinger → Website → Advanced → Node.js → Environment variables)

Never prefix any of these with `NEXT_PUBLIC_`. After changing them, redeploy.

```
EMAIL_ROUTER_ENABLED=true
EMAIL_PROVIDER_PRIORITY=brevo,mailjet,resend
BREVO_API_KEY=...            BREVO_WEBHOOK_SECRET=<random 32+ chars>
MAILJET_API_KEY=...          MAILJET_SECRET_KEY=...    MAILJET_WEBHOOK_SECRET=<random 32+ chars>
RESEND_API_KEY=(existing)    RESEND_WEBHOOK_SECRET=(existing)
EMAIL_FROM=noreply@clipiro.com   (existing — used by all three unless *_SENDER_EMAIL is set)
SOCIAL_TOKEN_KEY=(existing)  — also encrypts deferred email payloads
```

Generate a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`

## DNS / sender verification (do this in the providers' dashboards and your DNS host — nothing here changes DNS)

Each provider gives you the exact records; add them at the DNS host for clipiro.com.

1. **Brevo** → Senders, Domains & Dedicated IPs → Domains → Add `clipiro.com` → it shows a
   `brevo-code` TXT, a DKIM record (CNAME or TXT) and a DMARC suggestion. Add them, click Verify.
   Then add `noreply@clipiro.com` as a sender if Brevo asks.
2. **Mailjet** → Account → Sender domains & addresses → Add domain → it shows an ownership TXT,
   an SPF include (`include:spf.mailjet.com`) and a DKIM TXT (`mailjet._domainkey`). Add, then "Check now".
3. **Resend** — already verified (existing).
4. **SPF — one record only.** Merge every provider's include into the single `v=spf1` TXT on the
   domain you send from, e.g. `v=spf1 include:spf.brevo.com include:spf.mailjet.com ~all`
   (use the exact includes each dashboard shows; Resend's SPF lives on its `send.` subdomain, so it
   usually doesn't need to be in the root record). Keep total DNS lookups ≤ 10.
5. **DMARC** — one `_dmarc.clipiro.com` TXT, e.g. `v=DMARC1; p=none; rua=mailto:dmarc@clipiro.com`.
   Start at `p=none`, move to `quarantine` once reports show all three providers aligned.
6. Confirm on Admin → Email → Providers → **Test connection**: it should say "credentials OK,
   sender verified" (Mailjet/Brevo check the sender; Resend can only check with a full-access key).

## Webhooks

| Provider | URL | Auth | Events |
|---|---|---|---|
| Brevo | `https://clipiro.com/api/webhooks/brevo` | Token auth = `BREVO_WEBHOOK_SECRET` (sent as `Authorization: Bearer`) or Basic auth with that password | request, delivered, soft_bounce, hard_bounce, blocked, spam, invalid_email, deferred, error |
| Mailjet | `https://mailjet:<MAILJET_WEBHOOK_SECRET>@clipiro.com/api/webhooks/mailjet` | Basic auth in URL (Mailjet's only option) | sent, bounce, blocked, spam |
| Resend | `https://clipiro.com/api/webhooks/resend` (existing) | Svix signature, `RESEND_WEBHOOK_SECRET` | add email.sent, email.delivery_delayed, email.failed to the existing three |

All three fail closed without their secret, dedupe redeliveries, apply status
only forwards, and suppress on hard bounce / complaint.

## Rollout

1. Migrations run automatically: `npm run build` (what Hostinger runs, for main
   AND for PR previews, which share the production database) starts with
   `prisma migrate deploy`. `20261119160000_email_multi_provider` (6 new tables,
   additive) was applied to prod by this PR's preview build on 2026-11-19;
   `20261125090000_email_rls` adds row-level security to them. The old code
   ignores the tables.
2. Set Brevo + Mailjet keys and secrets; leave `EMAIL_ROUTER_ENABLED` unset. Deploy.
3. Verify domains (above). Admin → Email → Providers → Test connection on each.
4. Set `EMAIL_ROUTER_ENABLED=true`, redeploy. Sign up with a test address; watch
   Admin → Email → Activity show `accepted` → `delivered`.
5. Configure the webhooks; confirm events arrive (a message moves to `delivered`).
6. Add the `email-maintenance` line to the crontab only if prod does not use
   `/api/cron-tick` (cron-tick dispatches it automatically from `lib/cron-schedule.ts`).

## Rollback

- **Fastest:** unset `EMAIL_ROUTER_ENABLED` and redeploy → sending is the
  pre-router code path, byte for byte (Resend → SMTP). Nothing else to undo.
- **Without a redeploy:** Admin → Email → Providers → disable a misbehaving
  provider, or reorder so a different one is first.
- The migration only adds tables; leaving them in place after a rollback is harmless.

## Retention

EmailMessage/EmailAttempt 90 days · EmailWebhookEvent 30 days · resolved
EmailAlert 90 days · EmailQuotaUsage ~13 months. Deferred payloads are wiped
as soon as the message sends or dead-letters (after 6 retries, ~5 h).
