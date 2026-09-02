import "dotenv/config";
import { prisma } from "../lib/prisma";
import { adoptExistingS3Object } from "../lib/asset-service";
import { parseS3Url } from "../lib/s3-url";

// One-shot, re-runnable backfill for the asset/clip provenance relations added
// by 20260902140000_asset_clip_provenance.
//
// Before that migration the graph simply wasn't recorded: Asset.sourceProjectId
// was a string with no foreign key that nothing resolved, Clip had no
// sourceAssetId at all, and no clip render was ever adopted into the asset
// library. This walks the history and reconstructs the links that CAN be
// established from data we actually have.
//
// Three passes, in dependency order:
//   1. Project.sourceAssetId  — match uploadedVideoUrl to an Asset by s3Key.
//   2. Asset.sourceClipId     — adopt already-rendered clip mp4s into the
//                               library, tagged with the clip that made them.
//   3. Clip.sourceAssetId     — inherit the project's source asset.
//
// Idempotent by construction: every write is conditional on the column still
// being null, and adoptExistingS3Object's first step is a (userId, s3Key)
// existence check that returns the existing row rather than creating a second
// one. Re-running is a no-op for anything already linked.
//
// It never guesses. A project whose uploadedVideoUrl doesn't resolve to an
// asset this user owns is counted as unresolved and left alone — a wrong link
// here would show one user's media as the source of another's clip, which is
// far worse than a missing "Related" section.
//
// Usage: tsx scripts/backfill-asset-provenance.ts [--dry-run] [--limit=N]

const BATCH = 200;

interface Counts {
  scanned: number;
  linked: number;
  alreadyLinked: number;
  unresolved: number;
  failed: number;
}

const zero = (): Counts => ({ scanned: 0, linked: 0, alreadyLinked: 0, unresolved: 0, failed: 0 });

function report(label: string, c: Counts, dryRun: boolean) {
  console.log(
    `${label}${dryRun ? " (dry run)" : ""}: ${c.linked} linked, ${c.alreadyLinked} already linked, ` +
      `${c.unresolved} unresolved, ${c.failed} failed, ${c.scanned} scanned.`,
  );
}

/** Pass 1 — bind each project to the Asset backing its uploadedVideoUrl. */
async function linkProjectSources(dryRun: boolean, limit: number): Promise<Counts> {
  const counts = zero();
  let cursor: string | undefined;

  for (;;) {
    const projects = await prisma.project.findMany({
      where: { uploadedVideoUrl: { not: null }, sourceAssetId: null },
      select: { id: true, userId: true, uploadedVideoUrl: true },
      orderBy: { id: "asc" },
      take: Math.min(BATCH, limit - counts.scanned),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (projects.length === 0) break;
    cursor = projects[projects.length - 1].id;

    for (const project of projects) {
      counts.scanned++;
      const loc = parseS3Url(project.uploadedVideoUrl!);
      if (!loc) {
        counts.unresolved++;
        continue;
      }
      // Scoped to the owner: never bind a project to another user's asset.
      const asset = await prisma.asset.findFirst({
        where: { userId: project.userId, s3Key: loc.key },
        select: { id: true },
      });
      if (!asset) {
        counts.unresolved++;
        continue;
      }
      if (dryRun) {
        counts.linked++;
        continue;
      }
      try {
        await prisma.project.update({ where: { id: project.id }, data: { sourceAssetId: asset.id } });
        counts.linked++;
      } catch (e) {
        counts.failed++;
        console.error(`project ${project.id}:`, e instanceof Error ? e.message : e);
      }
    }
    if (counts.scanned >= limit) break;
  }
  return counts;
}

/** Pass 2 — adopt already-rendered clip mp4s as assets, tagged to their clip. */
async function adoptRenderedClips(dryRun: boolean, limit: number): Promise<Counts> {
  const counts = zero();
  let cursor: string | undefined;

  for (;;) {
    const clips = await prisma.clip.findMany({
      where: { status: "ready", videoUrl: { not: null } },
      select: {
        id: true,
        index: true,
        title: true,
        durationSec: true,
        videoUrl: true,
        projectId: true,
        project: { select: { userId: true } },
      },
      orderBy: { id: "asc" },
      take: Math.min(BATCH, limit - counts.scanned),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (clips.length === 0) break;
    cursor = clips[clips.length - 1].id;

    for (const clip of clips) {
      counts.scanned++;
      const loc = parseS3Url(clip.videoUrl!);
      if (!loc) {
        counts.unresolved++;
        continue;
      }
      const existing = await prisma.asset.findFirst({
        where: { userId: clip.project.userId, s3Key: loc.key },
        select: { id: true, sourceClipId: true },
      });
      if (existing?.sourceClipId) {
        counts.alreadyLinked++;
        continue;
      }
      if (dryRun) {
        counts.linked++;
        continue;
      }
      try {
        if (existing) {
          // The row exists but predates sourceClipId (e.g. created by the old
          // hand-rolled edit-in-editor create). Attach the provenance rather
          // than making a second row for the same object.
          await prisma.asset.update({
            where: { id: existing.id },
            data: { sourceClipId: clip.id, sourceProjectId: clip.projectId, sourceFeature: "autoclip" },
          });
        } else {
          await adoptExistingS3Object({
            userId: clip.project.userId,
            s3Key: loc.key,
            mimeType: "video/mp4",
            name: clip.title || `AutoClip ${clip.index + 1}`,
            duration: clip.durationSec,
            sourceFeature: "autoclip",
            sourceProjectId: clip.projectId,
            sourceClipId: clip.id,
            skipModeration: true,
          });
        }
        counts.linked++;
      } catch (e) {
        counts.failed++;
        console.error(`clip ${clip.id} (${loc.key}): ${describeAdoptFailure(e)}`);
      }
    }
    if (counts.scanned >= limit) break;
  }
  return counts;
}

/**
 * Adopting a rendered clip needs a HeadObject to size it, so the common
 * failure is simply that the object is gone — deleted, lifecycle-expired, or
 * rendered before the current key scheme. The AWS SDK surfaces that as a
 * NotFound whose message is the unhelpful string "UnknownError", so name it.
 * These are safe to leave: the script is idempotent and a later run retries.
 */
function describeAdoptFailure(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === "NotFound" || e.name === "NoSuchKey") return "rendered object no longer in S3 — skipped";
    return `${e.name}: ${e.message}`;
  }
  return String(e);
}

/** Pass 3 — point each clip at its project's source asset. */
async function linkClipSources(dryRun: boolean, limit: number): Promise<Counts> {
  const counts = zero();
  let cursor: string | undefined;

  for (;;) {
    const clips = await prisma.clip.findMany({
      where: { sourceAssetId: null, project: { sourceAssetId: { not: null } } },
      select: { id: true, project: { select: { sourceAssetId: true } } },
      orderBy: { id: "asc" },
      take: Math.min(BATCH, limit - counts.scanned),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (clips.length === 0) break;
    cursor = clips[clips.length - 1].id;

    for (const clip of clips) {
      counts.scanned++;
      const sourceAssetId = clip.project.sourceAssetId;
      if (!sourceAssetId) {
        counts.unresolved++;
        continue;
      }
      if (dryRun) {
        counts.linked++;
        continue;
      }
      try {
        await prisma.clip.update({ where: { id: clip.id }, data: { sourceAssetId } });
        counts.linked++;
      } catch (e) {
        counts.failed++;
        console.error(`clip ${clip.id}:`, e instanceof Error ? e.message : e);
      }
    }
    if (counts.scanned >= limit) break;
  }
  return counts;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : Number.POSITIVE_INFINITY;

  if (Number.isNaN(limit) || limit <= 0) {
    console.error("--limit must be a positive number");
    process.exit(1);
  }

  console.log(dryRun ? "Dry run — no writes will be made.\n" : "Applying provenance backfill.\n");

  // Order matters: pass 3 reads what pass 1 wrote.
  report("Pass 1 — Project.sourceAssetId", await linkProjectSources(dryRun, limit), dryRun);
  report("Pass 2 — Asset.sourceClipId   ", await adoptRenderedClips(dryRun, limit), dryRun);
  report("Pass 3 — Clip.sourceAssetId   ", await linkClipSources(dryRun, limit), dryRun);

  if (dryRun) {
    // Pass 3's dry-run count is necessarily an undercount: it can only see
    // projects that ALREADY have a sourceAssetId, since pass 1 wrote nothing.
    console.log("\nNote: in dry-run, pass 3 undercounts — it cannot see the links pass 1 would have made.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
