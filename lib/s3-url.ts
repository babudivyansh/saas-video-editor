/**
 * Parse one of our own virtual-hosted-style S3 URLs into its bucket and key.
 *
 * Deliberately a leaf module with no imports. This lived in lib/reframe.ts,
 * which pulls in the AWS Rekognition client and lib/env's eager Zod parse — so
 * any route that only wanted to turn a URL back into a key inherited the whole
 * AWS surface, and failed at import time wherever env wasn't fully populated.
 * lib/reframe.ts re-exports this, so existing callers are unaffected.
 */
export function parseS3Url(url: string): { bucket: string; key: string } | null {
  const m = /^https:\/\/([^.]+)\.s3\.[^/]+\.amazonaws\.com\/(.+)$/.exec(url);
  if (!m) return null;
  return { bucket: m[1], key: decodeURIComponent(m[2]) };
}
