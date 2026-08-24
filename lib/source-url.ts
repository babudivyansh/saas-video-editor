// Re-mint a project's source-media URL at the moment it is used.
//
// P0-3: AutoClip stored the *presigned* upload URL in
// `Project.uploadedVideoUrl` and reused it for every later job. Presigned URLs
// expire (ours are minted for 6 hours), so any AutoClip run or re-render
// attempted after that window died on the very first step with
// `403 AccessDenied — Request has expired`, before any progress was written.
// Production evidence: a URL signed 2026-08-13 was still being used on
// 2026-08-24.
//
// The manual editor already does the right thing — see
// app/api/editor/render/route.ts, which resolves fresh signed URLs per render
// from the stored S3 key rather than trusting a stored URL. AutoClip has no
// key column on Project, so the key is recovered from the stored URL itself:
// the object key is the stable part, and only the signature expires.

import { env } from "@/lib/env";
import { getAssetReadUrl } from "@/utils/s3-upload";
import { logger } from "@/lib/logger";

/**
 * Recover the S3 object key from a stored media URL.
 *
 * Handles the three shapes this codebase can produce:
 *   • virtual-hosted S3  — https://<bucket>.s3.<region>.amazonaws.com/<key>
 *   • path-style S3      — https://s3.<region>.amazonaws.com/<bucket>/<key>
 *   • CDN                — https://<CDN_BASE_URL>/<key>
 *
 * Returns null when the URL isn't one of ours, so callers can fall back rather
 * than fabricate a key.
 */
export function s3KeyFromStoredUrl(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  // Query string carries the (expired) signature — never part of the key.
  const path = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  if (!path) return null;

  const bucket = env.AWS_S3_BUCKET;
  const host = url.hostname.toLowerCase();

  // CDN-fronted: the whole path is the key.
  if (env.CDN_BASE_URL) {
    try {
      const cdnHost = new URL(env.CDN_BASE_URL).hostname.toLowerCase();
      if (host === cdnHost) return path;
    } catch { /* malformed CDN config — fall through to the S3 forms */ }
  }

  // Virtual-hosted: bucket is a host label.
  if (bucket && host.startsWith(`${bucket.toLowerCase()}.`)) return path;

  // Path-style: bucket is the first path segment.
  if (bucket && host.includes("amazonaws.com")) {
    const prefix = `${bucket}/`;
    if (path.startsWith(prefix)) return path.slice(prefix.length) || null;
  }

  return null;
}

/**
 * A currently-valid URL for a stored source media URL.
 *
 * Falls back to the stored URL when the key cannot be recovered — a URL that
 * might work is strictly better than throwing on something we simply failed to
 * parse, and the caller's own download error handling still covers it.
 */
export async function freshSourceUrl(storedUrl: string): Promise<string> {
  const key = s3KeyFromStoredUrl(storedUrl);
  if (!key) {
    logger.warn("source-url", "could not recover an S3 key from a stored source URL; using it as-is");
    return storedUrl;
  }
  return getAssetReadUrl(key);
}
