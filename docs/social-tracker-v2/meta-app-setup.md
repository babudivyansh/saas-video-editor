# Enabling Instagram and Facebook

Instagram and Facebook are built and tested in this codebase, but they do not
appear in the Social Tracker's **Settings → Connect an account** because
`META_APP_ID` and `META_APP_SECRET` are not set. Both platforms come from **one
Meta app and one OAuth grant** — connecting once can yield several accounts (one
per Facebook Page, plus any Instagram account linked to those Pages).

This is the whole setup, in order.

---

## 0. What the user must have before any of this helps

A connection can only succeed if the *end user's* accounts are set up correctly.
This is the single most common cause of "I connected and got nothing":

- The Instagram account must be a **Business or Creator** account. Personal
  Instagram accounts expose no insights and cannot be connected.
- That Instagram account must be **linked to a Facebook Page** (Instagram app →
  Settings → Account type and tools → Linked accounts).
- The person connecting must have a role on the Page (Admin, or a role including
  `read_insights`).

If any of these is missing the OAuth flow completes and returns zero accounts —
which the callback reports as `connect_failed`, with the message *"We couldn't
fetch your account. Make sure it's a Business/Creator account and try again."*

## 1. Create the Meta app

1. Go to <https://developers.facebook.com/apps/> → **Create app**.
2. Use case: **Other** → app type **Business**.
3. Attach it to a Meta Business account when prompted.

## 2. Add the products

Add both, from the app dashboard:

- **Facebook Login** (not "Facebook Login for Business" — the flow here uses the
  standard dialog at `facebook.com/v22.0/dialog/oauth`)
- **Instagram Graph API**

## 3. Set the redirect URI

Facebook Login → **Settings** → *Valid OAuth Redirect URIs*:

```
https://clipiro.com/api/social/callback/meta
```

The path segment is `meta`, not `instagram` or `facebook` — one OAuth app serves
both platforms, and `lib/social/oauth.ts` builds this URI from
`NEXT_PUBLIC_APP_URL`. If that env var and this field disagree, Meta rejects the
callback with a redirect-URI mismatch. For local testing add
`http://localhost:3000/api/social/callback/meta` as a second entry.

Leave *Enforce HTTPS* on. Client OAuth login and Web OAuth login both stay on.

## 4. Permissions

The five the code requests (`lib/social/meta.ts`), all read-only — there is no
publishing or messaging scope:

| Permission | Why |
|---|---|
| `pages_show_list` | Discover which Pages the user administers |
| `pages_read_engagement` | Page followers, post engagement |
| `read_insights` | Page + Instagram insight metrics |
| `instagram_basic` | Instagram profile and media |
| `instagram_manage_insights` | Instagram reach, impressions, saves, watch time |

## 5. App Review — the part with a lead time

**In Development mode**, all five permissions work immediately, but *only* for
users with a role on the app (Admin / Developer / Tester, added under **App
roles**). This is enough to verify the integration end to end with your own
accounts, and is the fastest way to confirm the setup works.

**For public users**, `read_insights`, `instagram_manage_insights`,
`pages_read_engagement` and `pages_show_list` all require **App Review**, which
needs:

- A completed Business Verification for the Meta Business account.
- A privacy policy URL and a data deletion callback (or instructions URL).
- A screencast showing each permission being used in the product — Meta rejects
  submissions that only show the login, so record the actual Social Tracker
  Audience and Overview tabs displaying the data each permission provides.

Budget real calendar time; review commonly takes several business days and
first-time rejections are normal.

## 6. Set the environment variables

From **App settings → Basic**:

```
META_APP_ID=<App ID>
META_APP_SECRET=<App secret>
```

Both are declared optional in `lib/env.ts`, so the app boots without them — that
is exactly why the platforms could vanish silently. Once both are present,
`providerAvailability()` reports Instagram and Facebook as configured and the
connect cards become live on the next deploy. No migration or code change is
needed.

## 7. Verify

1. **Settings → Connect an account** should now show three live cards rather than
   one live and two dashed.
2. Click **Connect Instagram**. You should reach Meta's consent screen listing
   the five permissions above.
3. Approve. You should land back on `/dashboard/social-tracker/settings` with a
   success toast, and one new row per Page and per linked Instagram account.
4. Check **Audience**. Instagram only reports demographics for accounts with
   **100+ followers**; below that the tab correctly says there is no data yet,
   and that is Meta's limit, not a bug.
5. Run the capability probe against the new accounts and re-author the matrix:

   ```bash
   npx tsx scripts/social-probe.mjs --list
   ```

   `lib/social/capabilities.ts` is currently written from Meta's documentation.
   Meta retires insight metrics aggressively — `impressions` was already removed
   for IG media and accounts in Graph v22 — so the greyed "not reported" tiles
   cannot be trusted until the probe has run against a real account.

## Token lifetimes

The user token is exchanged for a long-lived one (~60 days) and Page tokens
derived from it do not expire while the user token is valid. `refreshTokens()`
in `lib/social/meta.ts` re-derives them. When a token finally lapses the account
is flagged `needs_reauth` and the UI shows a reconnect prompt rather than
failing silently.
