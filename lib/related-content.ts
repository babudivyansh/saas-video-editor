import { prisma } from "@/lib/prisma";
import { parseS3Url } from "@/lib/s3-url";
import { getAssetReadUrl } from "@/utils/s3-upload";

// Resolvers for the "Related" panels in Assets and Clips.
//
// Everything here answers one question in two directions: what produced this,
// and what did this produce. Before the provenance migration none of it was
// answerable — an asset had no idea which clips came out of it, and a finished
// clip couldn't name the video it was cut from.
//
// Two rules hold throughout:
//
//  1. Ownership is enforced in the query, never by filtering afterwards. Every
//     traversal is anchored to a userId, so a related row can only ever be the
//     caller's own. Provenance columns are ON DELETE SET NULL, which means a
//     stale id is always null rather than a pointer to someone else's row.
//  2. Media URLs are minted fresh. Clip.thumbnailUrl is stored as a permanent
//     unsigned S3 URL; handing that to the browser leaks a durable link to what
//     may be unreleased content, so it is re-signed here.

/** How many siblings/related rows to return before it stops being useful. */
const RELATED_LIMIT = 12;

export interface RelatedProjectRef {
  id: string;
  title: string;
  productType: string;
  status: string;
  clipCount: number;
  createdAt: string;
}

export interface RelatedClipRef {
  id: string;
  projectId: string;
  index: number;
  title: string | null;
  score: number | null;
  status: string;
  durationSec: number;
  startSec: number;
  endSec: number;
  thumbnailUrl: string | null;
}

export interface RelatedAssetRef {
  id: string;
  name: string;
  kind: string;
  size: number;
  duration: number | null;
  thumbnailUrl: string | null;
  createdAt: string;
}

export interface AssetRelated {
  /** Projects that used this asset as their source video. */
  usedIn: RelatedProjectRef[];
  /** Clips cut from this asset. */
  producedClips: RelatedClipRef[];
  /** Set when this asset IS a rendered clip — what it came out of. */
  derivedFrom: { clip: RelatedClipRef; project: RelatedProjectRef } | null;
  /** Other assets that entered the library through the same project. */
  siblings: RelatedAssetRef[];
}

export interface ClipRelated {
  source: {
    project: RelatedProjectRef;
    asset: RelatedAssetRef | null;
    /** Where this clip sits inside the source, for the mini timeline. */
    window: { startSec: number; endSec: number; sourceDurationSec: number | null };
  } | null;
  /** Other clips from the same run, best first. */
  siblingClips: RelatedClipRef[];
  derived: {
    dubs: Array<{ id: string; targetLang: string; status: string; createdAt: string }>;
    publishes: Array<{
      id: string;
      status: string;
      permalink: string | null;
      provider: string | null;
      publishedAt: string | null;
    }>;
    /** Editor projects seeded from this clip. */
    editorProjects: RelatedProjectRef[];
  };
}

/**
 * Re-sign a stored clip thumbnail. Renders are written to S3 at a predictable
 * key and the URL is persisted unsigned, so this converts it back to a
 * short-lived signed URL. A URL we can't parse (a CDN host, a legacy shape) is
 * passed through rather than dropped — a slightly stale thumbnail beats none.
 */
async function signStoredUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  const loc = parseS3Url(url);
  if (!loc) return url;
  return getAssetReadUrl(loc.key).catch(() => url);
}

function toProjectRef(p: {
  id: string;
  title: string;
  productType: string;
  status: string;
  createdAt: Date;
  _count?: { clips: number };
}): RelatedProjectRef {
  return {
    id: p.id,
    title: p.title,
    productType: p.productType,
    status: p.status,
    clipCount: p._count?.clips ?? 0,
    createdAt: p.createdAt.toISOString(),
  };
}

type ClipRow = {
  id: string;
  projectId: string;
  index: number;
  title: string | null;
  score: number | null;
  status: string;
  durationSec: number;
  startSec: number;
  endSec: number;
  thumbnailUrl: string | null;
};

async function toClipRefs(clips: ClipRow[]): Promise<RelatedClipRef[]> {
  return Promise.all(
    clips.map(async (c) => ({
      id: c.id,
      projectId: c.projectId,
      index: c.index,
      title: c.title,
      score: c.score,
      status: c.status,
      durationSec: c.durationSec,
      startSec: c.startSec,
      endSec: c.endSec,
      thumbnailUrl: await signStoredUrl(c.thumbnailUrl),
    })),
  );
}

const CLIP_REF_SELECT = {
  id: true,
  projectId: true,
  index: true,
  title: true,
  score: true,
  status: true,
  durationSec: true,
  startSec: true,
  endSec: true,
  thumbnailUrl: true,
} as const;

const PROJECT_REF_SELECT = {
  id: true,
  title: true,
  productType: true,
  status: true,
  createdAt: true,
  _count: { select: { clips: true } },
} as const;

async function toAssetRef(a: {
  id: string;
  name: string;
  kind: string;
  size: number;
  duration: number | null;
  thumbnailS3Key: string | null;
  createdAt: Date;
}): Promise<RelatedAssetRef> {
  return {
    id: a.id,
    name: a.name,
    kind: a.kind,
    size: a.size,
    duration: a.duration,
    thumbnailUrl: a.thumbnailS3Key ? await getAssetReadUrl(a.thumbnailS3Key).catch(() => null) : null,
    createdAt: a.createdAt.toISOString(),
  };
}

const ASSET_REF_SELECT = {
  id: true,
  name: true,
  kind: true,
  size: true,
  duration: true,
  thumbnailS3Key: true,
  createdAt: true,
} as const;

/**
 * Everything related to one asset. `userId` anchors every traversal — passing
 * an asset the caller doesn't own yields empty results rather than another
 * tenant's graph.
 */
export async function getAssetRelated(assetId: string, userId: string): Promise<AssetRelated> {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, userId },
    select: { id: true, sourceProjectId: true, sourceClipId: true },
  });
  if (!asset) {
    return { usedIn: [], producedClips: [], derivedFrom: null, siblings: [] };
  }

  const [usedInRows, producedRows, derivedClip, siblingRows] = await Promise.all([
    prisma.project.findMany({
      where: { sourceAssetId: asset.id, userId },
      select: PROJECT_REF_SELECT,
      orderBy: { createdAt: "desc" },
      take: RELATED_LIMIT,
    }),
    prisma.clip.findMany({
      where: { sourceAssetId: asset.id, project: { userId } },
      select: CLIP_REF_SELECT,
      // Best clips first, then generation order — the same ordering the
      // results grid uses, so the two views agree.
      orderBy: [{ score: "desc" }, { index: "asc" }],
      take: RELATED_LIMIT,
    }),
    asset.sourceClipId
      ? prisma.clip.findFirst({
          where: { id: asset.sourceClipId, project: { userId } },
          select: { ...CLIP_REF_SELECT, project: { select: PROJECT_REF_SELECT } },
        })
      : Promise.resolve(null),
    asset.sourceProjectId
      ? prisma.asset.findMany({
          where: {
            userId,
            sourceProjectId: asset.sourceProjectId,
            id: { not: asset.id },
            archivedAt: null,
          },
          select: ASSET_REF_SELECT,
          orderBy: { createdAt: "desc" },
          take: RELATED_LIMIT,
        })
      : Promise.resolve([]),
  ]);

  const [usedIn, producedClips, siblings] = await Promise.all([
    Promise.resolve(usedInRows.map(toProjectRef)),
    toClipRefs(producedRows),
    Promise.all(siblingRows.map(toAssetRef)),
  ]);

  let derivedFrom: AssetRelated["derivedFrom"] = null;
  if (derivedClip) {
    const [ref] = await toClipRefs([derivedClip]);
    derivedFrom = { clip: ref, project: toProjectRef(derivedClip.project) };
  }

  return { usedIn, producedClips, derivedFrom, siblings };
}

/**
 * Everything related to one clip. The caller is expected to have already
 * verified that the project belongs to the user AND that the clip belongs to
 * that project — but `userId` is still threaded through every query here so a
 * mistake at the call site can't turn into a cross-tenant read.
 */
export async function getClipRelated(
  clipId: string,
  projectId: string,
  userId: string,
): Promise<ClipRelated> {
  const clip = await prisma.clip.findFirst({
    where: { id: clipId, projectId, project: { userId } },
    select: {
      id: true,
      startSec: true,
      endSec: true,
      sourceAssetId: true,
      project: {
        select: {
          ...PROJECT_REF_SELECT,
          sourceAsset: { select: { ...ASSET_REF_SELECT, duration: true } },
        },
      },
    },
  });
  if (!clip) {
    return { source: null, siblingClips: [], derived: { dubs: [], publishes: [], editorProjects: [] } };
  }

  const [siblingRows, dubs, publishes, editorProjectRows] = await Promise.all([
    prisma.clip.findMany({
      where: { projectId, id: { not: clipId } },
      select: CLIP_REF_SELECT,
      orderBy: [{ score: "desc" }, { index: "asc" }],
      take: RELATED_LIMIT,
    }),
    prisma.clipDub.findMany({
      where: { clipId },
      select: { id: true, targetLang: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.clipPublish.findMany({
      where: { clipId },
      select: {
        id: true,
        status: true,
        permalink: true,
        publishedAt: true,
        socialAccount: { select: { provider: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // An editor project seeded from this clip points at the asset that WAS
    // this clip's render, so the hop is clip -> derived asset -> project.
    prisma.project.findMany({
      where: { userId, productType: "editor", sourceAsset: { sourceClipId: clipId } },
      select: PROJECT_REF_SELECT,
      orderBy: { createdAt: "desc" },
      take: RELATED_LIMIT,
    }),
  ]);

  const sourceAsset = clip.project.sourceAsset;
  return {
    source: {
      project: toProjectRef(clip.project),
      asset: sourceAsset ? await toAssetRef(sourceAsset) : null,
      window: {
        startSec: clip.startSec,
        endSec: clip.endSec,
        sourceDurationSec: sourceAsset?.duration ?? null,
      },
    },
    siblingClips: await toClipRefs(siblingRows),
    derived: {
      dubs: dubs.map((d) => ({
        id: d.id,
        targetLang: d.targetLang,
        status: d.status,
        createdAt: d.createdAt.toISOString(),
      })),
      publishes: publishes.map((p) => ({
        id: p.id,
        status: p.status,
        permalink: p.permalink,
        provider: p.socialAccount?.provider ?? null,
        publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
      })),
      editorProjects: editorProjectRows.map(toProjectRef),
    },
  };
}
