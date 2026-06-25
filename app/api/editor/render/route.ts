import { NextRequest, NextResponse } from "next/server";
import os from "os";
import path from "path";
import fs from "fs";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { markQuestComplete } from "@/lib/quests";
import { getToolConfig } from "@/lib/tool-config";
import { createRenderQueue, setRenderProgress } from "@/lib/render-queue";
import { generateASS, styleIndexToSubtitleStyle, runFFmpegArgs } from "@/utils/ffmpeg-render";
import { uploadFileToS3 } from "@/utils/s3-upload";
import { downloadFile } from "@/utils/download";
import { buildEditorFFmpegArgs, EditorRenderPaths, buildTrackDocFFmpegArgs, TrackRenderPaths } from "@/lib/editor-render";
import type { EditorDoc } from "@/lib/editor-types";
import type { TrackDoc, VideoClipData, AudioClipData } from "@/lib/track-editor-types";
import type { WordTiming } from "@/utils/elevenlabs";

export const maxDuration = 300;

interface RenderPayload {
  projectId: string;
  userId: string;
  doc: EditorDoc;
  creditCost: number;
}

interface TrackRenderPayload {
  projectId: string;
  userId: string;
  doc: TrackDoc;
  creditCost: number;
}

async function refundCredit(userId: string, cost: number) {
  try {
    await prisma.user.update({ where: { id: userId }, data: { credits: { increment: cost } } });
    const cached = await redis.get(`credits:${userId}`);
    if (cached !== null) {
      await redis.set(`credits:${userId}`, String(parseInt(cached, 10) + cost), "EX", 3600);
    }
  } catch (e) {
    console.error(`[editor/render] refund failed for ${userId}:`, e);
  }
}

// Offset times so they are output-relative (0 = first frame of the trimmed clip)
// and drop anything outside the trim window. buildEditorFFmpegArgs still uses the
// real trimStart/trimEnd for the input seek.
function normalizeDoc(doc: EditorDoc): EditorDoc {
  const { trimStart, trimEnd } = doc;
  const dur = trimEnd - trimStart;
  const clampSec = (t: number) => Math.max(0, Math.min(dur, t - trimStart));

  const segments: WordTiming[] = doc.captions.segments
    .map(s => ({ word: s.word, start: Math.max(0, s.start - trimStart * 1000), end: Math.min(dur * 1000, s.end - trimStart * 1000) }))
    .filter(s => s.end > s.start);

  return {
    ...doc,
    captions: { ...doc.captions, segments },
    textOverlays: doc.textOverlays
      .map(o => ({ ...o, start: clampSec(o.start), end: clampSec(o.end) }))
      .filter(o => o.end > o.start),
    imageOverlays: doc.imageOverlays
      .map(o => ({ ...o, start: clampSec(o.start), end: clampSec(o.end) }))
      .filter(o => o.end > o.start),
  };
}

async function renderJob(payload: RenderPayload): Promise<void> {
  const { projectId, userId, doc, creditCost } = payload;
  const tmp = os.tmpdir();
  const videoPath = path.join(tmp, `${projectId}-src.mp4`);
  const assPath   = path.join(tmp, `${projectId}.ass`);
  const outPath   = path.join(tmp, `${projectId}-out.mp4`);
  const musicPath = path.join(tmp, `${projectId}-music.mp3`);
  const imagePaths: string[] = [];
  const cleanup = [videoPath, assPath, outPath, musicPath];

  try {
    await setRenderProgress(projectId, "downloading");
    await downloadFile(doc.videoUrl, videoPath);

    const norm = normalizeDoc(doc);

    // Captions → ASS
    let ass: string | undefined;
    if (norm.captions.enabled && norm.captions.segments.length > 0) {
      const style = styleIndexToSubtitleStyle(norm.captions.styleIndex, norm.captions.mode);
      generateASS(norm.captions.segments, style, assPath);
      ass = assPath;
    }

    // Music
    let music: string | undefined;
    if (norm.music?.url) {
      await downloadFile(norm.music.url, musicPath);
      music = musicPath;
    }

    // Image overlays
    for (let i = 0; i < norm.imageOverlays.length; i++) {
      const p = path.join(tmp, `${projectId}-img${i}.png`);
      await downloadFile(norm.imageOverlays[i].url, p);
      imagePaths[i] = p;
      cleanup.push(p);
    }

    const paths: EditorRenderPaths = { video: videoPath, ass, music, images: imagePaths, output: outPath };
    await setRenderProgress(projectId, "rendering");
    await runFFmpegArgs(buildEditorFFmpegArgs(norm, paths));

    await setRenderProgress(projectId, "uploading");
    const key = `editor/${userId}/${projectId}.mp4`;
    const videoUrl = await uploadFileToS3(outPath, key, "video/mp4");

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "completed", videoUrl },
    });
  } catch (err) {
    console.error(`[editor/render] job ${projectId} failed:`, err);
    await prisma.project.update({ where: { id: projectId }, data: { status: "failed" } }).catch(() => {});
    await refundCredit(userId, creditCost);
    throw err;
  } finally {
    for (const p of cleanup) {
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
    }
  }
}

async function renderTrackDocJob(payload: TrackRenderPayload): Promise<void> {
  const { projectId, userId, doc, creditCost } = payload;
  const tmp = os.tmpdir();
  const outPath = path.join(tmp, `${projectId}-v2-out.mp4`);
  const cleanup: string[] = [outPath];

  const videoPaths = new Map<string, string>();
  const audioPaths = new Map<string, string>();

  try {
    // Deduplicate downloads by URL — multiple clips can share the same source file
    const urlToLocal = new Map<string, string>();
    let fileIdx = 0;

    for (const track of doc.tracks) {
      for (const clip of track.clips) {
        if (clip.data.kind === "video") {
          const url = (clip.data as VideoClipData).url;
          if (!url) continue;
          if (!urlToLocal.has(url)) {
            const p = path.join(tmp, `${projectId}-v${fileIdx++}.mp4`);
            await downloadFile(url, p);
            urlToLocal.set(url, p);
            cleanup.push(p);
          }
          videoPaths.set(clip.id, urlToLocal.get(url)!);
        } else if (clip.data.kind === "audio") {
          const url = (clip.data as AudioClipData).url;
          if (!url) continue;
          if (!urlToLocal.has(url)) {
            const ext = url.includes(".mp3") ? "mp3" : "mp4";
            const p = path.join(tmp, `${projectId}-a${fileIdx++}.${ext}`);
            await downloadFile(url, p);
            urlToLocal.set(url, p);
            cleanup.push(p);
          }
          audioPaths.set(clip.id, urlToLocal.get(url)!);
        }
      }
    }

    const renderPaths: TrackRenderPaths = { videoPaths, audioPaths, output: outPath };
    await setRenderProgress(projectId, "rendering");
    await runFFmpegArgs(buildTrackDocFFmpegArgs(doc, renderPaths));

    await setRenderProgress(projectId, "uploading");
    const key = `editor/${userId}/${projectId}.mp4`;
    const videoUrl = await uploadFileToS3(outPath, key, "video/mp4");

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "completed", videoUrl },
    });
  } catch (err) {
    console.error(`[editor/render] TrackDoc job ${projectId} failed:`, err);
    await prisma.project.update({ where: { id: projectId }, data: { status: "failed" } }).catch(() => {});
    await refundCredit(userId, creditCost);
    throw err;
  } finally {
    for (const p of cleanup) {
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
    }
  }
}

let _queue: ReturnType<typeof createRenderQueue<RenderPayload>> | null = null;
function getQueue() {
  if (!_queue) _queue = createRenderQueue<RenderPayload>("editor-render", renderJob);
  return _queue;
}

let _trackQueue: ReturnType<typeof createRenderQueue<TrackRenderPayload>> | null = null;
function getTrackQueue() {
  if (!_trackQueue) _trackQueue = createRenderQueue<TrackRenderPayload>("editor-render-v2", renderTrackDocJob);
  return _trackQueue;
}

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { projectId?: string; doc?: Record<string, unknown>; tool?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const rawDoc = body.doc;
  if (!rawDoc) return NextResponse.json({ error: "doc is required" }, { status: 400 });

  const isV2 = rawDoc._v === 2;

  if (!isV2 && !(rawDoc as unknown as EditorDoc).videoUrl) {
    return NextResponse.json({ error: "doc.videoUrl is required" }, { status: 400 });
  }

  const tool = body.tool === "advanced-editor" ? "advanced-editor" : "simple-editor";
  const { creditCost } = await getToolConfig(tool);

  // Fast pre-check against cached balance.
  const cachedCredits = await redis.get(`credits:${auth.userId}`);
  const cachedBal = cachedCredits !== null ? parseInt(cachedCredits, 10) : null;
  if (creditCost > 0 && cachedBal !== null && cachedBal < creditCost) {
    return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
  }

  // Deduct atomically (rollback if it dips negative).
  if (creditCost > 0) {
    const user = await prisma.user.update({
      where: { id: auth.userId },
      data: { credits: { decrement: creditCost } },
      select: { credits: true },
    });
    if (user.credits < 0) {
      await prisma.user.update({ where: { id: auth.userId }, data: { credits: { increment: creditCost } } });
      return NextResponse.json({ error: "Insufficient credits" }, { status: 402 });
    }
    await redis.set(`credits:${auth.userId}`, String(user.credits), "EX", 3600);
  }

  // Get a representative source URL for the project record
  let sourceUrl = "";
  if (isV2) {
    const trackDoc = rawDoc as unknown as TrackDoc;
    outer: for (const track of trackDoc.tracks) {
      for (const clip of track.clips) {
        if (clip.data.kind === "video") {
          sourceUrl = (clip.data as VideoClipData).url;
          break outer;
        }
      }
    }
  } else {
    sourceUrl = (rawDoc as unknown as EditorDoc).videoUrl;
  }

  // Reuse or create a project to track render status.
  let projectId = body.projectId ?? "";
  if (projectId) {
    const existing = await prisma.project.findFirst({ where: { id: projectId, userId: auth.userId } });
    if (!existing) {
      if (creditCost > 0) await refundCredit(auth.userId, creditCost);
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    await prisma.project.update({
      where: { id: projectId },
      data: { status: "rendering", editorDoc: rawDoc as object, productType: tool, uploadedVideoUrl: sourceUrl },
    });
  } else {
    const project = await prisma.project.create({
      data: {
        userId: auth.userId,
        title: "Editor video",
        status: "rendering",
        productType: tool,
        uploadedVideoUrl: sourceUrl,
        editorDoc: rawDoc as object,
        backgroundUrl: "",
        subtitlesStyle: {},
      },
    });
    projectId = project.id;
  }

  if (isV2) {
    getTrackQueue().enqueue(projectId, { projectId, userId: auth.userId, doc: rawDoc as unknown as TrackDoc, creditCost });
  } else {
    getQueue().enqueue(projectId, { projectId, userId: auth.userId, doc: rawDoc as unknown as EditorDoc, creditCost });
  }
  void markQuestComplete(auth.userId, "first-clip");

  return NextResponse.json({ projectId, status: "rendering" });
}
