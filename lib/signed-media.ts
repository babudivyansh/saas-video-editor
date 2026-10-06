import { parseS3Url } from "@/lib/s3-url";
import { getAssetReadUrl } from "@/utils/s3-upload";

/**
 * Renders and thumbnails are stored with permanent unsigned S3 URLs; a client
 * needs a short-lived signed one. Non-S3 URLs pass through, and a signing
 * failure falls back to the stored URL rather than dropping the image.
 */
export async function resignMediaUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  const loc = parseS3Url(url);
  if (!loc) return url;
  return getAssetReadUrl(loc.key).catch(() => url);
}
