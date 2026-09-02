/**
 * Parse one of our own virtual-hosted-style S3 URLs into its bucket and key.
 *
 * Deliberately a leaf module with no imports. This lived in lib/reframe.ts,
 * which pulls in the AWS Rekognition client and lib/env's eager Zod parse — so
 * any route that only wanted to turn a URL back into a key inherited the whole
 * AWS surface, and failed at import time wherever env wasn't fully populated.
 * lib/reframe.ts re-exports this, so existing callers are unaffected.
 *
 * The key is taken from the pathname alone. The previous regex captured
 * everything after the host with a greedy `(.+)$`, which meant a *presigned*
 * URL yielded a key with the entire signature query string glued onto it —
 * "uploads/u/v.mp4?X-Amz-Algorithm=…". That never matches a stored s3Key, and
 * Project.uploadedVideoUrl is exactly that: a presigned URL with a 6-hour
 * lifetime. Anything resolving an asset from a stored project URL silently
 * found nothing.
 */
export function parseS3Url(url: string): { bucket: string; key: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;

  const host = /^([^.]+)\.s3\.[^/]+\.amazonaws\.com$/.exec(u.hostname);
  if (!host) return null;

  const key = decodeURIComponent(u.pathname.replace(/^\//, ""));
  if (!key) return null;

  return { bucket: host[1], key };
}
