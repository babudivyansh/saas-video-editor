# CSP and where the web session lives: follow-ups

Written 2026-10-23 with the pre-launch hardening branch (enforcing CSP, social
OAuth browser binding, per-account 2FA lockout, TOTP on 2FA-disable and
change-email, GETDEL reset tokens). This file covers two items that branch did
not do, and why.

## 1. The session JWT is readable by page JavaScript (localStorage)

**State today.** A successful sign-in sets the httpOnly `session` cookie AND
hands the same 7-day JWT to the page, which keeps it in
`localStorage.token`:

- `app/components/AuthForm.tsx` (password / OTP sign-in)
- `app/api/auth/callback/google/route.ts` (an inline script writes it)
- `app/admin/AdminLayoutClient.tsx` (admin elevation)
- `app/components/AuthContext.tsx` reads it back and exposes `token`

Client code then sends it as `Authorization: Bearer …`, and
`getAuthUser()` in `lib/auth.ts` only reads that header. The cookie is used by
`proxy.ts`'s optimistic gate and by `getServerAuthUser()` for Server Components.

**Risk.** Any script injection (XSS) can read the token and use it from
anywhere for up to 7 days. CSP lowers the odds of injection, but the policy
still needs `'unsafe-inline'` (section 2), so it is not a strong backstop.

**Why it wasn't done in the hardening branch.** It is not small: about 48
`localStorage` token reads/writes and about 114 files that build a Bearer header
(`authHeaders()`, `` `Bearer ${token}` ``). Moving them in a hurry before the
8 Nov launch could easily sign users out or break uploads.

**Plan (a separate PR, after launch):**

1. Server: let `getAuthUser()` fall back to the `session` cookie when there's no
   Authorization header. It must run the same session-record check
   (`readSessions` + `tokenHash`). Cookie-authenticated mutations then need CSRF
   protection: the cookie is `SameSite=Lax`, which already blocks cross-site
   POST/PUT/DELETE from other sites. Also add an `Origin`/`Sec-Fetch-Site`
   check in `proxy.ts` for non-GET `/api/*` requests that carry no
   Authorization header.
2. Client: `fetch` sends same-origin cookies by default, so the Bearer headers
   can be removed in batches. `authHeaders()` returns `{}` first, then the call
   sites are cleaned up.
3. Stop writing `localStorage.token` in the three places above. Clear any
   leftover value on load. `AuthContext` gets "signed in" from `/api/auth/me`
   instead of from the token's presence.
4. Mobile (`/api/mobile/v1`) keeps Bearer. It has no cookie jar, and its tokens
   live in the Android Keystore, not in a page.
5. After that, the Google callback no longer needs its inline script. It can be
   a plain 302 that sets the cookie.

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
4. The Google callback's inline script (see 1.5) must be gone, or nonce'd.
5. Watch `/api/csp-report` for a week before shipping.
