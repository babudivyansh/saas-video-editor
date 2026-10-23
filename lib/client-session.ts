// The web session lives ONLY in the httpOnly `session` cookie. Page
// JavaScript never sees the JWT, so a script injection can't read it and
// replay it from elsewhere (it used to sit in localStorage.token).
//
// Client-safe: imported by components, so no server imports here.
//
// Two small pieces let the client keep working without the real token:
//  - SIGNED_IN_COOKIE: a non-httpOnly "1" set next to the session cookie with
//    the same lifetime. It carries no credential; it only tells the page
//    whether asking /api/auth/me is worth it, so logged-out visitors don't
//    fire a 401 on every marketing page.
//  - COOKIE_SESSION_TOKEN: what `token` / `Authorization: Bearer …` hold on
//    the web now. It isn't a JWT, so getAuthUser() ignores it and reads the
//    cookie instead; the ~120 call sites that still build a Bearer header keep
//    working unchanged. The Android app sends a real JWT and is unaffected.

export const SIGNED_IN_COOKIE = "signed_in";
export const COOKIE_SESSION_TOKEN = "cookie-session";

/** True when the browser holds a session cookie (as far as the page can tell). */
export function hasSignedInCookie(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((c) => c.trim() === `${SIGNED_IN_COOKIE}=1`);
}

/**
 * What to pass where a bearer token used to go: the placeholder when signed
 * in, null when not (so existing `if (!token)` checks still mean "signed out").
 */
export function clientAuthToken(): string | null {
  return hasSignedInCookie() ? COOKIE_SESSION_TOKEN : null;
}

/** Sets the marker client-side (the server sets it at sign-in; this covers migration). */
export function markSignedIn(): void {
  if (typeof document === "undefined") return;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SIGNED_IN_COOKIE}=1; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax${secure}`;
}

export function clearSignedIn(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SIGNED_IN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
