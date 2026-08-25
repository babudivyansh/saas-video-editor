import "dotenv/config";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";

/**
 * READ-ONLY historical scan for the source-URL tenant-isolation incident.
 *
 * Question it answers: are there `Project` rows whose `uploadedVideoUrl` names
 * a Clipiro-managed S3 object that the project's owner cannot be shown to own?
 * That is the persisted footprint a cross-tenant reference would leave, and it
 * is still queryable long after the vulnerability was closed — unlike S3
 * access logs, which are not enabled on the bucket.
 *
 * Run against production with a read-only DATABASE_URL:
 *   tsx scripts/scan-cross-tenant-sources.ts
 *
 * WRITES NOTHING. Only `findMany` / `findFirst` are used, and there is no
 * mutation anywhere in this file — deliberately, so it is safe to point at
 * production.
 *
 * IMPORTANT — what a hit does and does not mean:
 *   • A hit proves a suspicious *persisted reference* existed.
 *   • It does NOT prove media bytes were ever accessed. Before re-minting was
 *     introduced such a URL was inert (S3 answered 403), and after the
 *     ownership gate it is refused. The window of concern is only between
 *     those two changes.
 *   • Benign causes exist: legacy imports, keys that predate Asset rows, and
 *     rows whose object no longer exists. Every hit is a lead to triage, not a
 *     verdict.
 *
 * Output discipline: prints ids, timestamps and key PREFIXES only. Never full
 * object keys, never URLs, never signatures — the same rule the resolver's own
 * logging follows, so the output is safe to paste into an incident doc.
 */

/** Mirrors lib/source-url.ts s3KeyFromStoredUrl — key recovery only. */
function s3KeyFromStoredUrl(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const path = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  if (!path) return null;

  const bucket = env.AWS_S3_BUCKET;
  const host = url.hostname.toLowerCase();

  if (env.CDN_BASE_URL) {
    try {
      if (host === new URL(env.CDN_BASE_URL).hostname.toLowerCase()) return path;
    } catch { /* ignore malformed CDN config */ }
  }
  if (bucket && host.startsWith(`${bucket.toLowerCase()}.`)) return path;
  if (bucket && host.includes("amazonaws.com")) {
    const prefix = `${bucket}/`;
    if (path.startsWith(prefix)) return path.slice(prefix.length) || null;
  }
  return null;
}

/** Key prefix only — never the full object path. */
const redact = (key: string) => key.split("/").slice(0, 2).join("/") + "/…";

async function main() {
  const projects = await prisma.project.findMany({
    where: { uploadedVideoUrl: { not: null } },
    select: { id: true, userId: true, uploadedVideoUrl: true, status: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: "asc" },
  });

  let external = 0;
  let ownedByPrefix = 0;
  let ownedByAsset = 0;
  const suspicious: {
    projectId: string; owner: string; keyPrefix: string; actualOwner: string;
    createdAt: Date; updatedAt: Date; status: string;
  }[] = [];

  for (const p of projects) {
    const key = s3KeyFromStoredUrl(p.uploadedVideoUrl!);
    if (!key) { external++; continue; }

    // Proof 1 (weaker): the key sits under the owner's own prefix. Segment
    // equality, exactly as ownsKey does — never startsWith.
    if (key.split("/").includes(p.userId)) { ownedByPrefix++; continue; }

    // Proof 2 (authoritative): an Asset row for (owner, key).
    const owned = await prisma.asset.findFirst({
      where: { userId: p.userId, s3Key: key }, select: { id: true },
    });
    if (owned) { ownedByAsset++; continue; }

    // Neither proof holds. Find who, if anyone, authoritatively owns it —
    // this is what separates "cross-tenant reference" from "unknown legacy key".
    const realOwner = await prisma.asset.findFirst({
      where: { s3Key: key }, select: { userId: true },
    });

    suspicious.push({
      projectId: p.id,
      owner: p.userId,
      keyPrefix: redact(key),
      actualOwner: realOwner?.userId ?? "UNKNOWN (no Asset row for this key)",
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      status: p.status,
    });
  }

  const crossTenant = suspicious.filter((s) => !s.actualOwner.startsWith("UNKNOWN"));
  const unknownOwner = suspicious.filter((s) => s.actualOwner.startsWith("UNKNOWN"));

  console.log("─".repeat(72));
  console.log("Cross-tenant source reference scan (READ ONLY)");
  console.log("─".repeat(72));
  console.log(`projects with a source URL : ${projects.length}`);
  console.log(`  external / non-Clipiro   : ${external}`);
  console.log(`  owned (path prefix)      : ${ownedByPrefix}`);
  console.log(`  owned (Asset row)        : ${ownedByAsset}`);
  console.log(`  UNPROVEN                 : ${suspicious.length}`);
  console.log(`    ├─ owned by ANOTHER user : ${crossTenant.length}   <-- the finding that matters`);
  console.log(`    └─ no Asset row at all   : ${unknownOwner.length}   (legacy/deleted — triage separately)`);
  console.log("");

  for (const s of crossTenant) {
    console.log(`CROSS-TENANT  project=${s.projectId} owner=${s.owner} actualOwner=${s.actualOwner}`);
    console.log(`              key=${s.keyPrefix} status=${s.status} created=${s.createdAt.toISOString()} updated=${s.updatedAt.toISOString()}`);
  }
  if (unknownOwner.length > 0) {
    console.log("");
    console.log(`(${unknownOwner.length} row(s) reference a Clipiro key with no Asset row — most likely legacy`);
    console.log(" imports that predate asset tracking. Listed for triage, not counted as cross-tenant.)");
    for (const s of unknownOwner.slice(0, 20)) {
      console.log(`  UNKNOWN-OWNER project=${s.projectId} owner=${s.owner} key=${s.keyPrefix} created=${s.createdAt.toISOString()}`);
    }
    if (unknownOwner.length > 20) console.log(`  …and ${unknownOwner.length - 20} more`);
  }

  console.log("");
  console.log("CLASSIFICATION:", crossTenant.length > 0
    ? "CROSS-TENANT REFERENCES FOUND"
    : suspicious.length > 0
      ? "NO CROSS-TENANT REFERENCES FOUND (some keys have no ownership record — see above)"
      : "NO CROSS-TENANT REFERENCES FOUND");
  console.log("");
  console.log("Reminder: a persisted reference is not proof the bytes were read.");
  console.log("S3 server access logging is DISABLED on this bucket, so object-level");
  console.log("GET history does not exist. See docs/source-url-tenant-isolation-incident.md.");
}

main()
  .catch((e) => { console.error("scan failed:", e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
