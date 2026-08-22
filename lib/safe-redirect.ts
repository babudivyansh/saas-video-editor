// Validates a "next" redirect destination so post-login navigation can return
// a user to where they actually meant to go, without ever becoming an open
// redirect. Shared by proxy.ts (server-side) and the login/auth-modal client
// code (browser-side) — keep this dependency-free so both can import it.
//
// Only an internal, single-leading-slash path is ever accepted. Everything
// else (absolute URLs, protocol-relative `//host`, backslash tricks,
// `javascript:`/`data:` schemes, and anything with embedded whitespace/control
// characters that browsers or intermediaries normalize into a scheme) is
// rejected outright — reject-by-default, not a denylist of known-bad schemes.

const MAX_NEXT_LENGTH = 2048;

/**
 * Returns `raw` if it is safe to use as a same-origin redirect target,
 * otherwise `null`. Never throws.
 */
export function getSafeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.length > MAX_NEXT_LENGTH) return null;

  // Reject anything containing a control character (includes \t \n \r, which
  // browsers strip when resolving a URL — "/\tjavascript:alert(1)" must not
  // sneak past a naive scheme check because of this).
  if (/[\x00-\x1f]/.test(raw)) return null;

  // Must start with exactly one "/", never "//" or "/\" (both are
  // protocol-relative in a browser and resolve to an arbitrary external host).
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;

  // Belt-and-suspenders: no scheme allowed to appear anywhere in the value
  // (blocks "/redirect?to=javascript:..." style payloads and bare
  // "https://evil.com" values that don't start with "/" but could still slip
  // through a looser check elsewhere).
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return null;
  if (raw.includes("://")) return null;

  // Confirm it parses as a same-origin path relative to a throwaway base —
  // catches anything the checks above missed (e.g. unicode lookalikes the
  // browser's own URL parser would normalize into "//").
  try {
    const parsed = new URL(raw, "http://internal.invalid");
    if (parsed.origin !== "http://internal.invalid") return null;
  } catch {
    return null;
  }

  return raw;
}

/** Appends `?next=<path>` (safe-validated) to a target URL that doesn't already have one. */
export function withNextParam(targetPath: string, next: string | null | undefined): string {
  const safe = getSafeNextPath(next);
  if (!safe) return targetPath;
  const sep = targetPath.includes("?") ? "&" : "?";
  return `${targetPath}${sep}next=${encodeURIComponent(safe)}`;
}
