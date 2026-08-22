// Shared helpers for carrying a validated "next" redirect destination through
// an OAuth round trip (currently Google — app/api/auth/google/route.ts and
// app/api/auth/callback/google/route.ts) inside the existing anti-CSRF state
// parameter, without adding a second cookie. Google echoes `state` back
// verbatim, so it's the one piece of app data guaranteed to survive the trip
// to the provider and back.
//
// Pure and dependency-light on purpose — this is a trust-boundary-adjacent
// piece of logic (it feeds a redirect target and an inline <script> block)
// and needs to be directly unit-testable without mocking the rest of the
// OAuth flow (token exchange, profile fetch, etc.).

import { getSafeNextPath } from "./safe-redirect";

/** Builds the opaque `state` value: `<nonce>` alone, or `<nonce>.<base64url next>` when a safe next path is given. */
export function encodeOAuthState(nonce: string, next: string | null | undefined): string {
  const safe = getSafeNextPath(next);
  return safe ? `${nonce}.${Buffer.from(safe, "utf8").toString("base64url")}` : nonce;
}

/**
 * Recovers the "next" destination from a state value built by
 * encodeOAuthState. Always re-validates with getSafeNextPath — the encoding
 * only needed to survive transport, it was never a trust boundary on its
 * own (the state value itself is CSRF-validated separately, by the caller,
 * before this is ever invoked — see the callback route). Never throws.
 */
export function decodeNextFromState(state: string): string | null {
  const dotIndex = state.indexOf(".");
  if (dotIndex === -1) return null;
  try {
    const decoded = Buffer.from(state.slice(dotIndex + 1), "base64url").toString("utf8");
    return getSafeNextPath(decoded);
  } catch {
    return null;
  }
}

/**
 * JSON.stringify a value for safe interpolation inside an inline <script>
 * block. Escaping "<" as < means a "</script" sequence inside the
 * value can never terminate the block early — the browser's HTML parser
 * looks for that literal substring before the JS parser ever sees the
 * string content. getSafeNextPath allows any same-origin path (no
 * HTML-safety guarantee, e.g. "/</script><script>..." passes it), so this
 * is a real boundary for any caller embedding a next value into HTML, not
 * defense-in-depth for show.
 */
export function toInlineScriptJson(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003C");
}
