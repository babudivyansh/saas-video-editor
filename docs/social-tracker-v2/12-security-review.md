# 12 — Security review

Reviewed against the code, not the documentation. Companion to
`docs/social-tracker-security.md`, which describes the intended posture; this
document records what the audit actually found.

## Verdict

The security fundamentals are **genuinely good** — better than the frontend
suggests. Tokens are encrypted with a key held outside the database, PKCE and
signed single-use state protect the OAuth flow, subscription is re-checked against
Postgres on every request, and disconnect deliberately stays available to lapsed
users so they can always remove their data.

Two findings are serious: an unrevocable capability token, and tenancy enforced by
seven copies of one line with no test coverage and no RLS.

## Findings

### S1 — Report links cannot be revoked · **Critical**

`app/api/social/report-link/route.ts` signs
`{accountId, purpose: "social-report"}` with `JWT_SECRET` and a 7-day expiry.
`app/report/social/[token]/page.tsx` verifies the signature and renders the
account's analytics. There is no server-side record that a link was issued, no
revocation path, and no view audit.

A link pasted into the wrong channel is live for a week. The only kill switch is
rotating `JWT_SECRET`, which logs out every user of the product.

**Fix.** `SocialReportLink` row keyed by `jti`; `accountIds` move out of the token
into the row; the public page verifies the JWT **and** loads the row, rejecting on
missing / `revokedAt` / expired; `DELETE /api/social/report-link/[id]` sets
`revokedAt` and writes a Redis denylist `social:revoked-jti:{jti}` with TTL =
remaining lifetime so revocation is immediate; Settings lists active links with
view counts and a Revoke button; `recordAudit(userId, "social.report_link.create" |
".revoke")` using the existing helper.

Also note the public page is `dynamic = "force-dynamic"` — correct, and it must
stay that way, since a cached render would leak past revocation.

### S2 — Tenancy is copy-pasted and untested · **Critical**

There is no Postgres RLS. Isolation rests entirely on
`findFirst({ where: { id, userId } })` repeated in seven route files — `analytics`,
`posts`, `insights` (GET and POST), `export`, `report-link`, plus `refreshAccount`
and `disconnect` in `service.ts`. Child tables (`SocialPost`,
`SocialAccountSnapshot`, `SocialAudienceSnapshot`, `AiInsight`) are then queried by
`accountId` alone, which is safe *only* because of that preceding check.

Every instance is correct today. Nothing in CI would notice if one stopped being.
There are zero tests for `app/api/social/**`.

**Fix.** One `assertOwnedAccount(userId, accountId)` in `lib/social/api.ts`, plus a
**mandatory cross-tenant 404 test on every social route**. A route without that
test does not merge. The v2 build adds ~10 routes, so this control has to exist
before the surface triples.

RLS remains the structurally correct answer and is out of scope here — retrofitting
it means auditing every query path in the whole product, which is not something to
do inside a feature branch. Recorded in [13](13-roadmap.md).

### S3 — No input validation on any social route · **High**

Zero zod despite zod ^4 being a dependency. Validation is hand-rolled and
inconsistent: allow-list `Set`s for `range` and `sort`, a `/^[\w.\-]{2,60}$/`
handle regex, `Number.isFinite` checks, and inline
`Math.round(clamp(tz, ±840) / 15) * 15` arithmetic.

No injection risk was found — Prisma parameterises everything, and the one raw SQL
statement (`pruneOldSnapshots`) has no user input. The risk is unvalidated values
reaching query construction and producing opaque 500s rather than actionable 400s.

**Fix.** `lib/social/schemas.ts` and `ZodError → 400 {error, issues}` in
`withSocial`.

### S4 — Documentation was stale on two security-relevant claims · **Medium** *(fixed)*

`docs/social-tracker-security.md` stated that YouTube scopes are read-only, and
that tokens refresh "within 60s of expiry".

Neither was true. `youtube.upload` was added for the Auto-Clip publish flow — a
write scope on a page whose TL;DR claimed read-only. And `REFRESH_WINDOW_MS` is
5 minutes for YouTube, 7 days for Meta.

A security document that misstates the granted scopes is worse than no document,
because it is what a reviewer trusts. Both corrected in this branch.

### S5 — Sync failures are invisible · **Medium**

`service.syncAccount`'s catch calls the logger only. Sentry is installed and
configured. Provider breakage — including auth failures that could indicate a
compromised or revoked token — surfaces only when a user complains.

**Fix.** `Sentry.captureException` with `tags: {provider, accountId, job}`.

### S6 — Meta per-post fan-out is a self-inflicted availability risk · **Medium**

100 concurrent Graph calls on a backfill (C3) trips Meta's Business Use Case rate
limit, which applies **app-wide**. One user's backfill degrades every user's sync.
Availability, not confidentiality, but a real security property.

**Fix.** `graphBatch`.

### S7 — Rate limiting is applied to exactly one route · **Medium**

Only `POST /api/social/accounts/[id]` is limited (1 per 600s, with a correct
`Retry-After`). Analytics, posts, export and insights are unlimited per-user.
`export` in particular can pull 1,000 posts or 5,000 snapshots per call.

The competitor vendor budget (`social:competitor-budget:{yyyy-mm}`, default 300,
raising `BudgetExhaustedError`) is a good pattern and should be the model for
anything with an external cost.

**Fix.** The rate-limit table in [10](10-api.md), via the existing
`lib/rate-limit.ts`.

### S8 — `availableProviders()` misreports configuration · **Low**

`lib/social/providers.ts` returns every registry key regardless of whether the
provider's credentials are configured, contradicting its own doc comment. A user
can start an OAuth flow that cannot complete. Not exploitable; a correctness bug
that leaks configuration state into the UI.

### S9 — No social data in the account export · **Low**

`lib/account-export.ts` does not include social accounts, posts, snapshots or
insights. Deletion is handled correctly by cascade, but a GDPR *access* request
would return an incomplete dataset.

## Controls verified as sound

Recording these explicitly so a redesign does not quietly lose them.

**Token encryption** — `lib/encryption.ts`, AES-256-GCM, format
`v1:<iv>:<tag>:<ct>`, a fresh 96-bit IV per value, key from `SOCIAL_TOKEN_KEY`
(base64, exactly 32 bytes) held outside the database, and a **hard throw in
production if unset**. Dev derives a key from `JWT_SECRET`. Tokens never reach the
browser.

**OAuth flow** — PKCE with a 32-byte verifier and S256; a signed `state` JWT
carrying `{userId, provider, nonce}` with a 600s TTL; the verifier stored at
`social:pkce:{nonce}` and **deleted on consume**, so state is genuinely single-use;
and a `provider_mismatch` re-check that the callback provider matches the one the
state was issued for. The callback redirects to `appUrl()` from
`NEXT_PUBLIC_APP_URL` rather than `req.nextUrl.origin` — deliberate, and correct
behind a reverse proxy.

**Session auth** — `getAuthUser` requires a `sessionId` claim, loads the user's
session list from Redis, and requires `tokenHash === sha256(token)`. A stolen JWT
alone is insufficient; the session must still exist server-side.

**Subscription gating** — `requireSubscriber` reads `subscriptionEndsAt` from
Postgres per request, so a lapsed subscription takes effect immediately rather
than at token expiry.

**Deliberate auth asymmetry** — `DELETE` on accounts and competitors uses
`getAuthUser`, not `requireSubscriber`, so a lapsed user can always remove their
own data. That is a considered decision and should be preserved.

**Least privilege** — Meta scopes are read-only. YouTube has one write scope,
`youtube.upload`, used solely by the Auto-Clip publish flow on explicit user
action; it cannot delete or modify existing content.

**Data minimisation** — no passwords, DMs, follower lists or comment text are
stored. Only aggregate metrics and minimal public profile data.

**Erasure** — cascade deletes from `User` through every child table.

**Cron authentication** — shared secret via bearer header or query parameter.
Header is preferred; the query form should be treated as legacy, since it lands in
access logs.

## Priorities

| | Finding | Priority |
|---|---|---|
| S1 | Report links unrevocable | Critical |
| S2 | Tenancy copy-pasted, untested, no RLS | Critical |
| S3 | No input validation | High |
| S5 | Sync failures unreported | Medium |
| S6 | Meta fan-out availability risk | Medium |
| S7 | Rate limiting on one route only | Medium |
| S8 | `availableProviders()` misreports | Low |
| S9 | Social data missing from account export | Low |
| — | Postgres RLS | Separate project |
