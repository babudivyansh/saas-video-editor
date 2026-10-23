import { env } from "@/lib/env";
import { parseS3Url } from "@/lib/s3-url";
import { getAssetReadUrl } from "@/utils/s3-upload";

// Stored media URLs (Clip.videoUrl, Project.videoUrl, Asset.url, …) are the
// permanent, UNSIGNED form https://<bucket>.s3.<region>.amazonaws.com/<key>.
// They only ever worked because the bucket allowed public reads. With Block
// Public Access on (docs/ops/s3-private-bucket.md) a plain GET of one is a 403,
// so every reader — a client <video>, a server fetch(), a third party we hand a
// URL to — must get a presigned URL minted from the key instead.

/** The S3 key of a URL pointing at OUR media bucket, else null. A URL naming
 * some other bucket is never re-signed: getAssetReadUrl always signs against
 * our bucket, so trusting the host's bucket label would sign the wrong object. */
export function ownBucketKey(url: string | null | undefined): string | null {
  if (!url) return null;
  const loc = parseS3Url(url);
  if (!loc || loc.bucket !== env.AWS_S3_BUCKET) return null;
  return loc.key;
}

/**
 * Renders and thumbnails are stored with permanent unsigned S3 URLs; a client
 * needs a short-lived signed one. Non-S3 URLs pass through, and a signing
 * failure falls back to the stored URL rather than dropping the image.
 *
 * Only for SERVER-WRITTEN columns read from a row the caller already owns
 * (renders, thumbnails, dubs). A column a client can set to an arbitrary URL
 * — Project.uploadedVideoUrl, User.avatarUrl — must go through an ownership
 * check first (lib/source-url.ts classifySource), or this would sign another
 * tenant's key.
 */
export async function resignMediaUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  const key = ownBucketKey(url);
  if (!key) return url;
  return getAssetReadUrl(key).catch(() => url);
}

/**
 * A URL the server (or a third party it hands it to) can actually GET right
 * now. Our-bucket URLs become a presigned URL with a short lifetime; anything
 * else is returned unchanged. Same trust rule as resignMediaUrl: the stored URL
 * must come from a server-written column on a row the caller owns.
 */
export async function fetchableMediaUrl(url: string, expiresInSec = 3600): Promise<string> {
  const key = ownBucketKey(url);
  return key ? getAssetReadUrl(key, expiresInSec) : url;
}
