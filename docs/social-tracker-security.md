# Social Tracker — Security & Data Handling

How Clipiro protects user data when a creator links a YouTube, Instagram, or
Facebook account to the Social Tracker. This documents the threat model, the
controls in code, the data we store (and deliberately don't), and operational
procedures (key rotation, breach response, compliance).

> TL;DR — We use OAuth with **read-only** scopes, the platform's tokens **never
> reach the browser**, they are **encrypted at rest with AES-256-GCM** under a key
> kept separate from the database, and connecting is **CSRF-protected** (signed
> state + PKCE). We store analytics numbers and minimal public profile data —
> never passwords, DMs, or follower lists.

---

## 1. Threat model

| Threat | Mitigation |
|---|---|
| Stolen DB dump exposes OAuth tokens | Tokens stored only as AES-256-GCM ciphertext; key is **not** in the DB (§4) |
| XSS steals tokens from the browser | Tokens are **never sent to the client**; they live server-side only (§3) |
| CSRF / forged OAuth callback links a victim's account to an attacker | Signed, expiring `state` JWT + one-time PKCE verifier (§2) |
| Over-broad access (posting, DMs, PII) | Least-privilege **read-only** scopes only (§5) |
| Leaked token used indefinitely | Short-lived access tokens + server-side refresh; revoke on disconnect (§6) |
| Non-paying users probing the feature | Every endpoint is subscriber-gated server-side (§7) |
| Key compromise | Documented rotation + forced re-auth (§9) |

Trust boundary: the browser is **untrusted** for platform credentials. The only
token the browser holds is the app's own session JWT (used to call our API); the
social platform tokens stay entirely on the server.

---

## 2. OAuth flow hardening (CSRF, replay, PKCE)

`lib/social/oauth.ts`, `app/api/social/connect/[provider]`, `app/api/social/callback/[provider]`.

1. The **connect** request is authenticated (the client sends its session `Bearer`
   token). The server mints a `state` = JWT `{ userId, provider, nonce }` signed
   with `JWT_SECRET`, expiring in **10 minutes**.
2. A per-attempt **PKCE** `code_verifier` is generated and stored **server-side in
   Redis** under the nonce (never sent to the browser); the `code_challenge`
   (S256) goes in the authorize URL.
3. The **callback** is a top-level browser redirect with *no* `Authorization`
   header — so the user's identity is recovered from the **verified `state` JWT**,
   not from anything the browser asserts. The PKCE verifier is read from Redis and
   **deleted on use** (single-use), preventing replay.
4. The platform encoded in `state` must route through the OAuth app that received
   the callback, or it is rejected (`provider_mismatch`).
5. Redirect URIs are **exact, pre-registered** values derived from
   `NEXT_PUBLIC_APP_URL` — the provider rejects any other destination.

---

## 3. Tokens never reach the browser

- API responses are built from an explicit Prisma projection
  (`service.ts → overviewSelect`) that **does not select** `accessTokenEnc` or
  `refreshTokenEnc`. There is no endpoint that returns a platform token.
- All platform API calls (fetching analytics, refreshing tokens, revoking) happen
  **server-side** inside `lib/social/*`.
- The browser only ever sees aggregated metrics and public profile fields.

---

## 4. Encryption at rest (AES-256-GCM)

`lib/encryption.ts`.

- Algorithm: **AES-256-GCM** (authenticated encryption — confidentiality +
  tamper-detection via the GCM auth tag).
- Each value uses a **fresh random 96-bit IV**; ciphertext is stored as
  `v1:<iv>:<tag>:<data>` (base64), so the format is self-describing and versioned
  for future key/algorithm rotation.
- The 32-byte key comes from **`SOCIAL_TOKEN_KEY`** (base64), provided via
  environment / secret manager and **kept separate from the database**. A DB dump
  alone is therefore useless without the key.
- Production **requires** `SOCIAL_TOKEN_KEY`; the code throws if it is missing in
  `NODE_ENV=production`. (Dev derives a local key from `JWT_SECRET` for convenience
  only.)
- Operational guidance: the key should not be accessible to anyone who doesn't
  need it (DBAs, analysts). Store it in a managed secret store in production.

---

## 5. Least privilege (read-only scopes)

| Platform | Scopes requested | Notably **not** requested |
|---|---|---|
| YouTube (`lib/social/google.ts`) | `youtube.readonly`, `yt-analytics.readonly` | upload, manage, delete |
| Instagram + Facebook (`lib/social/meta.ts`) | `pages_show_list`, `pages_read_engagement`, `read_insights`, `instagram_basic`, `instagram_manage_insights` | publishing, messaging, ads management |

No scope grants the ability to post, delete, message, or read follower lists / DMs.

---

## 6. Token lifecycle & revocation

- **Refresh:** `service.getValidAccessToken()` refreshes an access token when it is
  within 60s of expiry and re-encrypts the result. Google issues refresh tokens
  (offline access); Meta uses long-lived tokens (~60 days).
- **Re-auth on failure:** if a refresh isn't possible, the account is marked
  `needs_reauth` and the UI prompts the user to reconnect — we never silently
  retry with a dead token.
- **Disconnect:** `service.disconnect()` calls the provider's **revoke** endpoint
  (Google `/revoke`, Meta `DELETE /me/permissions`) on a best-effort basis and
  then **deletes** the `SocialAccount` row (and via cascade, its posts/snapshots
  and the encrypted tokens). Disconnect is allowed for the owner regardless of
  subscription state, so users can always remove their data.
- **Account deletion:** `SocialAccount.userId` has `onDelete: Cascade`, so deleting
  a user removes all linked accounts, tokens, posts, and snapshots.

---

## 7. Access control (subscriber-gated)

- Every state-changing or data-reading social endpoint calls
  `requireSubscriber(req)` (`lib/auth.ts`), which verifies the session **and** an
  active subscription per-request from Postgres (so a lapse takes effect
  immediately). Non-subscribers receive **402** and the UI shows an upgrade prompt.
- Ownership is enforced on every per-account action (`findFirst({ id, userId })`)
  so one user can never refresh or disconnect another user's account.

---

## 8. Data minimization

We store, per account: the encrypted tokens, the provider account id, minimal
public profile (name, username, avatar URL), and **analytics numbers** (followers,
views, reach, likes, comments, watch time) plus daily snapshots for trend charts.

We do **not** store: passwords, follower/following lists, direct messages, private
contact info, or audience PII (demographics). Raw provider payloads kept in
`metricsJson` are aggregate metrics only.

---

## 9. Key rotation & breach response

- **Rotation:** generate a new 32-byte key, decrypt-then-re-encrypt existing rows
  with it (the `v1:` prefix lets us add a `v2:` and migrate lazily), then retire
  the old key. Until then, both keys can be supported during a migration window.
- **Suspected key/token compromise:** rotate `SOCIAL_TOKEN_KEY`, invalidate stored
  tokens by setting accounts to `needs_reauth` (forcing re-consent), and revoke at
  the providers. Because tokens are read-only and per-user, blast radius is limited
  to analytics reads.
- **Audit:** connect / disconnect / manual refresh / needs_reauth transitions
  are recorded in the existing `AuditLog` model (actions `social.connect`,
  `social.disconnect`, `social.refresh`, `social.needs_reauth` — see
  `recordAudit` in `lib/social/service.ts`). Writes are best-effort: an audit
  failure never fails the user action.

---

## 10. Transport & secrets

- All provider traffic is HTTPS. App credentials (`GOOGLE_CLIENT_SECRET`,
  `META_APP_SECRET`, `SOCIAL_TOKEN_KEY`, `SOCIAL_REFRESH_SECRET`) live in
  environment variables / a secret manager — never in source or shipped to the
  client.
- The scheduled-refresh endpoint (`/api/cron/social-refresh`) requires a shared
  `SOCIAL_REFRESH_SECRET`.

---

## 11. Compliance

- **Google API Services User Data Policy (Limited Use):** YouTube data is used
  only to provide the user-facing analytics feature; it is not sold, not used for
  ads, and not transferred except as needed to provide the feature. Read-only
  scopes; production use requires Google OAuth verification.
- **Meta Platform Terms & Developer Policies:** Instagram/Facebook insights are
  used solely to display the connecting user their own analytics. Requires Meta
  App Review for public availability; until then it runs in development mode for
  approved testers.
- **GDPR / data-subject rights:** users can disconnect at any time (erasing tokens
  + analytics), and account deletion cascades to all social data. The privacy
  policy (`app/privacy/page.tsx`) discloses what is collected and why.

---

## 12. Production go-live checklist

- [ ] `SOCIAL_TOKEN_KEY` provisioned in the production secret store (32 random bytes, base64).
- [ ] Google Cloud OAuth client created; production redirect URI registered; OAuth consent screen **verified**.
- [ ] Meta app created; redirect URI registered; **App Review** passed for the insights scopes; switched from Dev to Live.
- [ ] `SOCIAL_REFRESH_SECRET` set and an external scheduler (or `SOCIAL_REFRESH_DRIVER=bullmq`) configured.
- [ ] Privacy policy updated and linked from the consent screens.
