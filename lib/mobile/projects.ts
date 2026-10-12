import type { Prisma } from "@prisma/client";
import type { BulkDeleteResult, Clip, ClipAspect, ClipDetail, DownloadLink, ProjectDetail, ProjectSort, ProjectSummary } from "@clipiro/shared";
import { prisma } from "@/lib/prisma";
import { RESUMABLE_PRODUCT_TYPES, STARTED_SIGNALS } from "@/lib/project-activity";
import { resignMediaUrl } from "@/lib/signed-media";
import { clipsWithJobsInFlight } from "@/lib/clip-busy";
import { invalidateDashboardSummary } from "@/lib/dashboard-summary-cache";
import { parseS3Url } from "@/lib/s3-url";
import { collectProjectMediaKeys, deleteUnreferencedKeys } from "@/lib/storage-cleanup";

// The Projects tab's reads for /api/mobile/v1/projects and /clips, from the
// same Project/Clip rows the web reads. Ownership is in every query (Clip has
// no userId; it's owned through its project), never a post-filter.

const PAGE = 30;
const ASPECTS: readonly ClipAspect[] = ["9:16", "16:9", "1:1"];
const aspectOf = (v: unknown): ClipAspect => (ASPECTS.includes(v as ClipAspect) ? (v as ClipAspect) : "9:16");

/** Web Project.status → the app's five. */
export function projectStatus(status: string): ProjectSummary["status"] {
  if (status === "draft") return "draft";
  if (status === "rendering") return "rendering";
  if (status === "failed") return "failed";
  if (status === "completed" || status === "ready") return "completed";
  return "processing"; // queued, analyzing, uploading…
}

/** Web Clip.status → the app's four. */
export function clipStatus(status: string): Clip["status"] {
  if (status === "ready") return "ready";
  if (status === "failed") return "failed";
  if (status === "rendering") return "rendering";
  return "queued";
}

type Doc = { aspect?: unknown; tracks?: Record<string, { timelineStart?: number; duration?: number; srcIn?: number }[] | undefined> } | null;

/**
 * A draft's editing checklist, from its editor doc: media placed, trimmed
 * (a cut-in or a split), captions, audio, text. Feeds the Drafts progress bar.
 */
export function draftStepsOf(doc: Doc): ProjectSummary["draftSteps"] {
  const t = doc?.tracks ?? {};
  const video = t.video ?? [];
  const steps: NonNullable<ProjectSummary["draftSteps"]> = [];
  if (video.length || (t.image ?? []).length) steps.push("media");
  if (video.length > 1 || video.some((c) => (c.srcIn ?? 0) > 0.05)) steps.push("trim");
  if ((t.caption ?? []).length) steps.push("captions");
  if ((t.audio ?? []).length) steps.push("audio");
  if ((t.text ?? []).length) steps.push("text");
  return steps;
}

function docDuration(doc: Doc): number {
  let end = 0;
  for (const track of Object.values(doc?.tracks ?? {})) for (const c of track ?? []) end = Math.max(end, (c.timelineStart ?? 0) + (c.duration ?? 0));
  return Math.round(end * 10) / 10;
}

const projectSelect = {
  id: true,
  title: true,
  productType: true,
  status: true,
  editorDoc: true,
  updatedAt: true,
  sourceAsset: { select: { duration: true } },
  _count: { select: { clips: true } },
  clips: { orderBy: { index: "asc" }, take: 1, select: { aspectRatio: true, thumbnailUrl: true } },
} satisfies Prisma.ProjectSelect;
type ProjectRow = Prisma.ProjectGetPayload<{ select: typeof projectSelect }>;

async function toSummary(p: ProjectRow): Promise<ProjectSummary> {
  const editor = p.productType === "editor";
  const doc = (p.editorDoc ?? null) as Doc;
  const first = p.clips[0];
  return {
    id: p.id,
    title: p.title,
    kind: editor ? "editor" : "autoclip",
    status: projectStatus(p.status),
    aspect: aspectOf(editor ? doc?.aspect : first?.aspectRatio),
    thumbnailUrl: (await resignMediaUrl(first?.thumbnailUrl ?? null)) ?? "",
    clipCount: p._count.clips,
    durationSec: editor ? docDuration(doc) : Math.round(p.sourceAsset?.duration ?? 0),
    updatedAt: p.updatedAt.toISOString(),
    ...(editor && p.status === "draft" ? { draftSteps: draftStepsOf(doc) } : {}),
  };
}

/** Real work only: the empty shells the app used to create are left out (lib/project-activity.ts). */
const ownedProjects = (userId: string): Prisma.ProjectWhereInput => ({ userId, productType: { in: RESUMABLE_PRODUCT_TYPES }, OR: STARTED_SIGNALS });

const PROJECT_ORDER: Record<ProjectSort, Prisma.ProjectOrderByWithRelationInput[]> = {
  recent: [{ updatedAt: "desc" }, { id: "desc" }],
  oldest: [{ updatedAt: "asc" }, { id: "asc" }],
  name: [{ title: "asc" }, { id: "asc" }],
  clips: [{ clips: { _count: "desc" } }, { updatedAt: "desc" }, { id: "desc" }],
};

export async function listProjects(userId: string, o: { cursor?: string | null; q?: string | null; sort?: ProjectSort; drafts?: boolean } = {}) {
  const q = o.q?.trim();
  const where: Prisma.ProjectWhereInput = {
    ...ownedProjects(userId),
    ...(o.drafts ? { productType: "editor", status: "draft" } : {}),
    ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: PROJECT_ORDER[o.sort ?? "recent"],
      take: PAGE + 1,
      ...(o.cursor ? { cursor: { id: o.cursor }, skip: 1 } : {}),
      select: projectSelect,
    }),
    prisma.project.count({ where }),
  ]);
  const page = rows.slice(0, PAGE);
  return { projects: await Promise.all(page.map(toSummary)), nextCursor: rows.length > PAGE ? page[page.length - 1]!.id : null, total };
}

const clipSelect = {
  id: true,
  projectId: true,
  index: true,
  title: true,
  score: true,
  durationSec: true,
  aspectRatio: true,
  status: true,
  thumbnailUrl: true,
  isFavorite: true,
  failureReason: true,
} satisfies Prisma.ClipSelect;
type ClipRow = Prisma.ClipGetPayload<{ select: typeof clipSelect }>;

async function toClip(c: ClipRow): Promise<Clip> {
  return {
    id: c.id,
    projectId: c.projectId,
    rank: c.index + 1,
    title: c.title?.trim() || `Clip ${c.index + 1}`,
    score: c.score == null ? null : Math.max(0, Math.min(99, c.score)),
    durationSec: Math.round(c.durationSec * 10) / 10,
    aspect: aspectOf(c.aspectRatio),
    status: clipStatus(c.status),
    thumbnailUrl: (await resignMediaUrl(c.thumbnailUrl)) ?? "",
    favorite: c.isFavorite,
    failureReason: c.status === "failed" ? (c.failureReason ?? "This clip couldn't be rendered.") : null,
  };
}

export async function getProjectDetail(userId: string, id: string): Promise<ProjectDetail | null> {
  const p = await prisma.project.findFirst({ where: { id, userId }, select: projectSelect });
  if (!p) return null;
  const clips = await prisma.clip.findMany({ where: { projectId: id }, orderBy: { index: "asc" }, select: clipSelect });
  return { ...(await toSummary(p)), clips: await Promise.all(clips.map(toClip)) };
}

export async function listClips(userId: string, opts: { aspect?: ClipAspect | null; favorites?: boolean; q?: string | null; cursor?: string | null }) {
  const q = opts.q?.trim();
  const where: Prisma.ClipWhereInput = {
    project: { userId },
    ...(opts.aspect ? { aspectRatio: opts.aspect } : {}),
    ...(opts.favorites ? { isFavorite: true } : {}),
    ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.clip.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      select: clipSelect,
    }),
    prisma.clip.count({ where }),
  ]);
  const page = rows.slice(0, PAGE);
  return { clips: await Promise.all(page.map(toClip)), nextCursor: rows.length > PAGE ? page[page.length - 1]!.id : null, total };
}

/**
 * Deletes several of the caller's projects in one statement (the multi-select
 * screens), with the web's single delete's clean-up: media nothing else
 * references is removed afterwards, and the dashboard cache is dropped.
 * Ids that aren't the caller's are ignored.
 */
export async function deleteProjects(userId: string, ids: string[]): Promise<BulkDeleteResult> {
  const owned = (await prisma.project.findMany({ where: { id: { in: ids }, userId }, select: { id: true } })).map((p) => p.id);
  if (owned.length === 0) return { deleted: 0, skipped: 0 };
  const keys = await collectProjectMediaKeys({ id: { in: owned } });
  const { count } = await prisma.project.deleteMany({ where: { id: { in: owned }, userId } });
  void deleteUnreferencedKeys(keys, `bulk delete of ${count} projects`);
  await invalidateDashboardSummary(userId);
  return { deleted: count, skipped: 0 };
}

/**
 * Deletes several of the caller's clips, with the web's single delete's
 * rules: a clip still rendering, queued, captioning or dubbing is skipped
 * (deleting it would break that job and its refund — lib/clip-busy.ts), and
 * its files are removed unless the asset library still uses them.
 */
export async function deleteClips(userId: string, ids: string[]): Promise<BulkDeleteResult> {
  const clips = await prisma.clip.findMany({ where: { id: { in: ids }, project: { userId } }, select: { id: true, status: true, videoUrl: true, thumbnailUrl: true } });
  const jobs = await clipsWithJobsInFlight(clips.map((c) => c.id));
  const free = clips.filter((c) => c.status !== "rendering" && c.status !== "queued" && !jobs.has(c.id));
  if (free.length === 0) return { deleted: 0, skipped: clips.length };
  const keys = free.flatMap((c) => [c.videoUrl, c.thumbnailUrl]).flatMap((u) => (u ? [parseS3Url(u)?.key].filter((k): k is string => !!k) : []));
  const { count } = await prisma.clip.deleteMany({ where: { id: { in: free.map((c) => c.id) }, project: { userId } } });
  void deleteUnreferencedKeys(keys, `bulk delete of ${count} clips`);
  await invalidateDashboardSummary(userId);
  return { deleted: count, skipped: clips.length - free.length };
}

/** The caller's clip, with its project id (the web routes are nested under it). */
export async function findOwnedClip(userId: string, clipId: string) {
  return prisma.clip.findFirst({ where: { id: clipId, project: { userId } }, select: { id: true, projectId: true } });
}

// Every part is on the score's own 0–99 scale (calibrateScore in lib/virality-score.ts).
const part = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(Math.max(0, Math.min(99, v))) : 0);
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function getClipDetail(userId: string, clipId: string): Promise<ClipDetail | null> {
  const c = await prisma.clip.findFirst({
    where: { id: clipId, project: { userId } },
    select: { ...clipSelect, startSec: true, endSec: true, videoUrl: true, scoreBreakdown: true, project: { select: { title: true } } },
  });
  if (!c) return null;
  const b = c.scoreBreakdown as Record<string, unknown> | null;
  return {
    ...(await toClip(c)),
    projectTitle: c.project.title,
    startSec: c.startSec,
    endSec: c.endSec,
    videoUrl: c.status === "ready" ? await resignMediaUrl(c.videoUrl) : null,
    breakdown: b
      ? { hook: part(b.hook), pacing: part(b.pacing), payoff: part(b.payoff), engagement: part(b.engagement), audio: part(b.audio), speechRate: part(b.speechRate), silence: part(b.silence) }
      : null,
    reasoning: text(b?.reasoning),
    hookExplanation: text(b?.hookExplanation),
  };
}

const LINK_TTL_SEC = 6 * 3600; // getAssetReadUrl's default

export async function getDownloadLink(userId: string, clipId: string): Promise<DownloadLink | "not-found" | "not-ready"> {
  const c = await prisma.clip.findFirst({ where: { id: clipId, project: { userId } }, select: { index: true, title: true, status: true, videoUrl: true } });
  if (!c) return "not-found";
  if (c.status !== "ready" || !c.videoUrl) return "not-ready";
  const url = await resignMediaUrl(c.videoUrl);
  if (!url) return "not-ready";
  const base = (c.title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || `clip-${c.index + 1}`;
  return { url, fileName: `${base}.mp4`, expiresAt: new Date(Date.now() + LINK_TTL_SEC * 1000).toISOString() };
}
