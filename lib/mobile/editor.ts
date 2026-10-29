import { randomUUID } from "crypto";
import { DEFAULT_DOC, docDimensions, docDuration, normalizeDoc, type Asset, type AudioClip, type EditorAspect, type EditorOpen, type ImageClip, type TimelineDoc, type VideoClip } from "@clipiro/shared";
import { adoptExistingS3Object } from "@/lib/asset-service";
import { getAsset, include, serialize } from "@/lib/mobile/assets";
import { prisma } from "@/lib/prisma";
import { copyS3Object, sanitizeS3Key } from "@/utils/s3-upload";

// The editor for /api/mobile/v1: the web editor's own timeline document
// (Project.editorDoc), so a draft opens on either. Reads go straight to the
// rows; saving goes through the web route (its version check); renders are
// the web's /api/editor/render (POST /jobs { type: "export" }).

/** Every file a doc plays from (video, audio, image tracks). */
export function assetIdsOf(doc: TimelineDoc): string[] {
  const t = doc.tracks;
  return [...new Set([...t.video, ...t.audio, ...t.image].map((c) => c.assetId))];
}

/** The caller's editor project, its doc and save version, and a playable link per file. */
export async function openEditor(userId: string, projectId: string): Promise<EditorOpen | null> {
  const p = await prisma.project.findFirst({
    where: { id: projectId, userId, productType: "editor" },
    select: { id: true, title: true, editorDoc: true, editorVersion: true },
  });
  if (!p) return null;
  const doc = normalizeDoc((p.editorDoc as unknown as TimelineDoc | null) ?? DEFAULT_DOC);
  const ids = assetIdsOf(doc);
  // Only the caller's files; one that was deleted simply has no entry.
  const rows = ids.length ? await prisma.asset.findMany({ where: { id: { in: ids }, userId }, include }) : [];
  const media: Record<string, Asset> = {};
  for (const a of await serialize(rows)) media[a.id] = a;
  return { projectId: p.id, title: p.title, version: p.editorVersion, doc, media };
}

const aspectFor = (w: number | null, h: number | null): EditorAspect => (!w || !h ? "9:16" : Math.abs(w - h) / Math.max(w, h) < 0.05 ? "1:1" : w > h ? "16:9" : "9:16");

/**
 * A new editor project around one file from the caller's Assets: a video or
 * an image fills the frame, audio goes on the audio track. The frame shape
 * follows the file's (a phone video stays 9:16).
 */
export async function createFromAsset(userId: string, assetId: string): Promise<{ projectId: string } | "not-found" | "not-ready"> {
  const a = await prisma.asset.findFirst({ where: { id: assetId, userId, archivedAt: null }, select: { id: true, name: true, kind: true, duration: true, width: true, height: true, status: true } });
  if (!a) return "not-found";
  if (a.status && a.status !== "ready") return "not-ready";
  const length = a.duration && a.duration > 0 ? a.duration : 5;
  const base = { id: randomUUID(), timelineStart: 0, duration: length };
  const doc: TimelineDoc = { ...DEFAULT_DOC, aspect: aspectFor(a.width, a.height), tracks: { video: [], text: [], audio: [], image: [], caption: [] } };
  if (a.kind === "video") doc.tracks.video.push({ ...base, type: "video", assetId: a.id, srcIn: 0, volume: 1, muted: false } satisfies VideoClip);
  else if (a.kind === "audio") doc.tracks.audio.push({ ...base, type: "audio", assetId: a.id, srcIn: 0, volume: 1 } satisfies AudioClip);
  else doc.tracks.image.push({ ...base, type: "image", assetId: a.id, x: 0.5, y: 0.5, scalePct: 1, opacity: 1 } satisfies ImageClip);
  const p = await prisma.project.create({
    data: { userId, title: a.name.replace(/\.[a-z0-9]+$/i, "") || "Untitled edit", productType: "editor", status: "draft", editorDoc: doc as unknown as object },
    select: { id: true },
  });
  return { projectId: p.id };
}

/** An empty edit in the chosen frame shape. */
export async function createBlank(userId: string, aspect: EditorAspect, title?: string): Promise<{ projectId: string }> {
  const doc: TimelineDoc = { ...DEFAULT_DOC, aspect, tracks: { video: [], text: [], audio: [], image: [], caption: [] } };
  const p = await prisma.project.create({
    data: { userId, title: title ?? "Untitled edit", productType: "editor", status: "draft", editorDoc: doc as unknown as object },
    select: { id: true },
  });
  return { projectId: p.id };
}

/**
 * Keeps a copy of the edit's latest export in the caller's Assets ("Save to
 * Assets" on the phone's Export screen). The render lives at
 * renders/<projectId>.mp4 and the next export overwrites it, so the Asset
 * gets its own copy of the bytes. Counts toward storage like any upload;
 * an AssetLimitError (file too big, storage full) reaches the route.
 */
export async function saveExportToAssets(userId: string, projectId: string): Promise<Asset | "not-found" | "not-exported"> {
  const p = await prisma.project.findFirst({
    where: { id: projectId, userId, productType: "editor" },
    select: { title: true, status: true, videoUrl: true, editorDoc: true },
  });
  if (!p) return "not-found";
  if (p.status !== "completed" || !p.videoUrl) return "not-exported";
  const doc = normalizeDoc((p.editorDoc as unknown as TimelineDoc | null) ?? DEFAULT_DOC);
  const size = docDimensions(doc);

  const key = sanitizeS3Key(`uploads/${userId}/${randomUUID()}.mp4`);
  // Same orphan safety as an upload: the asset-cleanup cron deletes the copy
  // if adopting it fails (storage full) or the process dies in between.
  const pending = await prisma.pendingUpload.create({ data: { userId, s3Key: key } });
  await copyS3Object(`renders/${projectId}.mp4`, key);
  const { asset } = await adoptExistingS3Object({
    userId,
    s3Key: key,
    mimeType: "video/mp4",
    name: `${p.title.slice(0, 120)}.mp4`,
    sourceFeature: "editor",
    sourceProjectId: projectId,
    duration: docDuration(doc),
    width: size.w,
    height: size.h,
    skipModeration: true,
  });
  await prisma.pendingUpload.delete({ where: { id: pending.id } }).catch(() => {});
  return (await getAsset(userId, asset.id))!;
}
