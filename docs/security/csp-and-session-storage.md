# CSP and where the web session lives: follow-ups

Written 2026-10-23 with the pre-launch hardening branch (enforcing CSP, social
OAuth browser binding, per-account 2FA lockout, TOTP on 2FA-disable and
change-email, GETDEL reset tokens). This file covers two items that branch did
not do, and why.

## 1. Where the web session lives: done (2026-10-24)

The web session now lives **only** in the httpOnly `session` cookie. Page
JavaScript never holds the JWT, so a script injection can't read it and replay
it from elsewhere. See `lib/client-session.ts`.

- **Server.** `getAuthUser()` (`lib/auth.ts`) uses a Bearer token only when
  it's JWT-shaped (the Android app). Otherwise it reads the `session` cookie,
  with the same session-record and hash check. A cookie-authenticated
  POST/PUT/PATCH/DELETE must be same-origin: `Sec-Fetch-Site` must not be
  cross-site, and any `Origin` must be our host. That sits on top of
  `SameSite=Lax`.
- **Signed-in marker.** `setSessionCookie` also sets a readable
  `signed_in=1` with the same lifetime, and `clearSessionCookie` clears both.
  The marker holds no credential; it only tells the page a session exists.
- **Client.** `AuthContext` decides "signed in" from the marker. Its
  `token`, and every `clientAuthToken()` call that replaced
  `localStorage.getItem("token")`, is the placeholder `"cookie-session"`.
  The Bearer headers that ~120 call sites still build carry that placeholder,
  which the server ignores. They can be removed gradually; nothing depends on
  them any more.
- **Migration.** A browser that still has `localStorage.token` from before
  the change has it deleted on load and carries on with its cookie, which was
  set at the same sign-in.
- **Google sign-in.** The callback is now a plain redirect that sets the
  cookie. The inline script that copied the JWT into localStorage is gone.
- **Mobile** (`/api/mobile/v1`) still sends a real Bearer JWT, unchanged.

## 2. Strict (nonce-based) CSP

**State today** (`lib/csp.ts`): the CSP is enforced. There is no
`'unsafe-eval'` outside `next dev`. `script-src` is `'self' 'unsafe-inline'`
plus Razorpay, with **no nonce**.

**Why there's no nonce yet.** In CSP3 browsers, a nonce makes
`'unsafe-inline'` ignored. Next.js puts per-request nonces only on pages it
renders dynamically. Statically prerendered pages (most marketing pages) have
inline scripts with no nonce, and those would all be blocked, so hydration
would break. The old Report-Only policy had exactly this mismatch, so its
reports were mostly noise.

**To get there:**

1. Render the pages dynamically. Option A: `await connection()` in the root
   layout, which costs SSR on every marketing hit. Option B: Next's
   experimental SRI hash-based CSP (`experimental.sri`), which keeps static
   pages. See `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`.
2. Pass the CSP as a **request** header too (`requestHeaders.set("Content-Security-Policy", csp)`
   in `proxy.ts`). That is how Next finds the nonce and puts it on its own
   scripts. `x-nonce` alone only reaches `JsonLd`.
3. Change `script-src` to `'self' 'nonce-…' 'strict-dynamic'` (Razorpay's
   checkout.js is then trusted through `strict-dynamic` when a nonce'd script
   loads it).
4. The Google callback's inline script is gone (section 1), so nothing there needs a nonce.
5. Watch `/api/csp-report` for a week before shipping.
