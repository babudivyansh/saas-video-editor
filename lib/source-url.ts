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
import { prisma } from "@/lib/prisma";
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
 * Is `key` media that `userId` is actually entitled to read?
 *
 * This gate is essential, not defensive dressing. `Project.uploadedVideoUrl` is
 * CLIENT-SETTABLE — the public API (`POST /api/v1/projects`) and the project
 * PATCH allowlist both accept an arbitrary https URL. Before re-minting
 * existed that was harmless: a URL naming another tenant's key carries no
 * valid signature, so S3 answers 403. Minting a fresh signature for whatever
 * key the client stored would turn that dead end into cross-tenant media
 * access, so ownership is proven before any signature is issued.
 *
 * Two accepted proofs, in order of authority:
 *   1. an Asset row for (userId, s3Key) — the real ownership record;
 *   2. the key sits under the user's own prefix (`…/<userId>/…`), which is how
 *      upload builds keys (`uploads/<userId>/<uuid>.<ext>`). Needed because
 *      some legacy sources predate Asset rows — see
 *      scripts/backfill-project-source-assets.ts.
 */
async function ownsKey(userId: string, key: string): Promise<boolean> {
  if (key.split("/").includes(userId)) return true;
  const asset = await prisma.asset.findFirst({ where: { userId, s3Key: key }, select: { id: true } });
  return asset !== null;
}

/**
 * What a stored source URL actually is, from an authorization standpoint.
 *
 *   • `owned`    — our storage, and `ownerUserId` is proven to own the object.
 *                  Carries the durable key and a freshly minted access URL.
 *   • `foreign`  — our storage, ownership NOT proven. Every privileged use must
 *                  refuse: no signature, no Rekognition job, nothing that
 *                  spends Clipiro's credentials on it.
 *   • `external` — not our storage at all (a third-party https URL). No
 *                  Clipiro credential is involved in fetching it, so this is
 *                  not a privileged operation and callers may pass it through.
 *
 * The three-way answer exists because "fall back to the stored URL" is only
 * safe for callers that *fetch the URL*. A caller that extracts the bucket/key
 * and uses our own IAM (Rekognition does exactly this) is not protected by a
 * dead signature at all, so it needs to distinguish `foreign` from `external`
 * and hard-refuse the former.
 *
 * `ownerUserId` must be the owner of the record the URL came from (e.g.
 * `project.userId`), read server-side — never a client-supplied value.
 */
export type SourceClassification =
  | { kind: "owned"; key: string; url: string }
  | { kind: "foreign"; key: string }
  | { kind: "external" };

export async function classifySource(
  storedUrl: string,
  ownerUserId: string,
  /** Lifetime of the minted grant. Callers handing the URL to a third party
   *  (the GPU/ASD service) deliberately ask for a shorter one than a
   *  same-process download needs. */
  expiresInSec?: number,
): Promise<SourceClassification> {
  const key = s3KeyFromStoredUrl(storedUrl);
  if (!key) {
    logger.warn("source-url", "could not recover an S3 key from a stored source URL; treating it as external");
    return { kind: "external" };
  }
  if (!(await ownsKey(ownerUserId, key))) {
    logger.error("source-url", "refusing to mint a source URL for a key the project owner does not own", {
      ownerUserId,
      // Prefix only — enough to investigate, never the full object path.
      keyPrefix: key.split("/").slice(0, 2).join("/"),
    });
    return { kind: "foreign", key };
  }
  // Only pass a TTL when one was asked for, so the default-expiry callers keep
  // calling getAssetReadUrl exactly as they always did.
  const url = expiresInSec === undefined ? await getAssetReadUrl(key) : await getAssetReadUrl(key, expiresInSec);
  return { kind: "owned", key, url };
}

/**
 * A currently-valid URL for a stored source media URL.
 *
 * Falls back to the stored URL rather than throwing when the key cannot be
 * recovered or cannot be proven owned. That keeps behaviour exactly as it was
 * before re-minting existed (the download simply fails on its own if the URL
 * is expired or foreign), so this can never grant access the caller did not
 * already have.
 *
 * Only correct for callers whose privileged step is *fetching this URL*. A
 * caller that instead hands the derived key to an AWS API on our credentials
 * must use `classifySource` and refuse `foreign` outright.
 */
export async function freshSourceUrl(storedUrl: string, ownerUserId: string): Promise<string> {
  const source = await classifySource(storedUrl, ownerUserId);
  return source.kind === "owned" ? source.url : storedUrl;
}
