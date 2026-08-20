import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { getAuthUser } from "@/lib/auth";
import { runFFmpegArgs, runFFmpegWithProgress, getMediaDurationSec } from "@/utils/ffmpeg-render";
import { withRateLimit } from "@/lib/with-rate-limit";
import { withRetry } from "@/lib/with-retry";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { chargeCredits, refundCredits, markGenerationStatus, updateGenerationProgress, checkModelAccess } from "@/lib/credits";
import { resolveUploadPolicy, assertWithinUploadPolicy, UploadPolicyError, uploadPolicyErrorBody, uploadPolicyErrorStatus } from "@/lib/upload-policy";
import { createJobStatusHandler, createJobCancelHandler, type CancellableJob } from "@/lib/job-routes";
import os from "os";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

export const maxDuration = 300;

// Sample at most this many frames regardless of video length, spacing them
// evenly across the video's duration — bounds OCR call count (and therefore
// cost/latency) for long videos instead of scaling 1:1 with duration.
const SAMPLE_FRAME_CAP = 90;
// Detections this close in time (relative to the sampling interval) and with
// enough bounding-box overlap are treated as the same on-screen subtitle
// rather than two separate ones.
const CLUSTER_TIME_GAP_MULTIPLIER = 2.5;
const CLUSTER_IOU_THRESHOLD = 0.3;
const MAX_CLUSTERS = 8;
// How many frames to OCR concurrently — bounded to avoid hammering fal.ai
// with dozens of simultaneous requests for a single job.
const OCR_CONCURRENCY = 4;

// Credits scale with video duration (a rough proxy for how many OCR calls a
// job makes, since sampling is capped/evenly-spaced across the duration) —
// TODO verify-before-ship: this app's fal.ai account had an exhausted
// balance during implementation, so the exact per-call cost of
// fal-ai/florence-2-large/ocr could not be confirmed live. Revisit this
// once real pricing is confirmable; this is a conservative placeholder, not
// a measured cost.
function creditCostForDuration(durationSec: number): number {
  return Math.max(2, Math.min(20, Math.ceil(durationSec / 10)));
}

interface DetectedRegion { x: number; y: number; w: number; h: number; t: number }
interface SubtitleCluster { x: number; y: number; w: number; h: number; startSec: number; endSec: number }

interface Job extends CancellableJob {
  status: "processing" | "done" | "error" | "cancelled";
  userId: string;
  inputPath: string;
  createdAt: number;
  meta?: { regionsDetected: number };
}

const g = globalThis as unknown as { __subtitleRemoverJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__subtitleRemoverJobs ?? (g.__subtitleRemoverJobs = new Map());

function sweep() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      for (const f of [job.inputPath, job.outputPath]) {
        try { fs.unlinkSync(f); } catch { /* ignore */ }
      }
      jobs.delete(id);
    }
  }
}

// Schema confirmed directly from @fal-ai/client's shipped type definitions
// for this endpoint (Florence2LargeOcrWithRegionOutput / OCRBoundingBox /
// BoundingBox — node_modules/@fal-ai/client/src/types/endpoints.d.ts) rather
// than from documentation guesswork: `results.quad_boxes` is an array of
// already-rectangular `{x, y, w, h, label}` boxes in absolute pixel
// coordinates — no corner-point math or normalization needed. Still parsed
// defensively (never throws) since a live response can in principle drift
// from its published type.
function parseOcrRegions(raw: unknown): Array<{ x: number; y: number; w: number; h: number }> {
  const results = (raw as { results?: { quad_boxes?: unknown[] } } | null | undefined)?.results;
  const boxes = results?.quad_boxes;
  if (!Array.isArray(boxes)) return [];
  return boxes
    .filter((b): b is { x: number; y: number; w: number; h: number } =>
      !!b && typeof b === "object" && ["x", "y", "w", "h"].every((k) => typeof (b as Record<string, unknown>)[k] === "number"))
    .map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
}

async function detectTextInFrame(framePath: string, tSec: number): Promise<DetectedRegion[]> {
  const buffer = fs.readFileSync(framePath);
  const blob = new Blob([new Uint8Array(buffer)], { type: "image/png" });
  const imageUrl = await withRetry(() => fal.storage.upload(blob), { timeoutMs: 20_000 });
  const { data } = await fal.subscribe("fal-ai/florence-2-large/ocr-with-region", {
    input: { image_url: imageUrl },
    logs: false,
  });
  return parseOcrRegions(data).map((r) => ({ ...r, t: tSec }));
}

function rectIntersectionOverUnion(a: DetectedRegion, b: { x: number; y: number; w: number; h: number }): number {
  const ix = Math.max(a.x, b.x), iy = Math.max(a.y, b.y);
  const iw = Math.min(a.x + a.w, b.x + b.w) - ix;
  const ih = Math.min(a.y + a.h, b.y + b.h) - iy;
  if (iw <= 0 || ih <= 0) return 0;
  const inter = iw * ih;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

// Groups per-frame detections into stable on-screen regions across time —
// subtitles are usually static within a scene, so consecutive detections in
// roughly the same place get merged into one cluster spanning the time range
// they appeared in, rather than treated as N separate unrelated boxes.
function clusterRegions(detections: DetectedRegion[], frameIntervalSec: number): SubtitleCluster[] {
  const sorted = [...detections].sort((a, b) => a.t - b.t);
  const maxGap = frameIntervalSec * CLUSTER_TIME_GAP_MULTIPLIER;
  const clusters: SubtitleCluster[] = [];

  for (const det of sorted) {
    const match = clusters.find(
      (c) => det.t - c.endSec <= maxGap && rectIntersectionOverUnion(det, c) >= CLUSTER_IOU_THRESHOLD,
    );
    if (match) {
      // Extend the cluster's time range and union its bounding box so it
      // covers every frame it was actually seen in.
      const x = Math.min(match.x, det.x), y = Math.min(match.y, det.y);
      const right = Math.max(match.x + match.w, det.x + det.w);
      const bottom = Math.max(match.y + match.h, det.y + det.h);
      match.x = x; match.y = y; match.w = right - x; match.h = bottom - y;
      match.endSec = det.t;
    } else {
      clusters.push({ x: det.x, y: det.y, w: det.w, h: det.h, startSec: det.t, endSec: det.t });
    }
  }

  // Pad each cluster's time range by half a sampling interval on each side so
  // the blur doesn't visibly cut in/out exactly on a sampled frame.
  for (const c of clusters) {
    c.startSec = Math.max(0, c.startSec - frameIntervalSec / 2);
    c.endSec += frameIntervalSec / 2;
  }

  return clusters
    .sort((a, b) => (b.endSec - b.startSec) - (a.endSec - a.startSec))
    .slice(0, MAX_CLUSTERS);
}

function buildDelogoFilter(clusters: SubtitleCluster[]): string | null {
  if (clusters.length === 0) return null;
  return clusters
    .map((c) => {
      const x = Math.max(0, Math.round(c.x));
      const y = Math.max(0, Math.round(c.y));
      const w = Math.max(2, Math.round(c.w));
      const h = Math.max(2, Math.round(c.h));
      return `delogo=x=${x}:y=${y}:w=${w}:h=${h}:show=0:enable='between(t,${c.startSec.toFixed(2)},${c.endSec.toFixed(2)})'`;
    })
    .join(",");
}

async function handlePOST(req: NextRequest) {
  sweep();

  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!env.FAL_KEY) {
    return NextResponse.json({ error: "Subtitle remover is not configured (missing FAL_KEY)" }, { status: 503 });
  }

  // Pro+ only while the per-frame OCR cost is unverified (see lib/tool-costs.ts).
  const access = await checkModelAccess(auth.userId, { allowedTiers: ["pro", "studio"] });
  if (!access.allowed) {
    return NextResponse.json(
      { error: `Subtitle Remover requires the ${access.requiredTier} plan or higher.`,
        requiredTier: access.requiredTier, upgradeUrl: "/pricing" },
      { status: 403 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const videoFile = formData.get("video") as File | null;
  if (!videoFile) return NextResponse.json({ error: "No video file provided" }, { status: 400 });

  const policy = await resolveUploadPolicy(auth.userId, "subtitle-remover");
  try {
    assertWithinUploadPolicy(policy, videoFile.size);
  } catch (e) {
    if (e instanceof UploadPolicyError) {
      return NextResponse.json(uploadPolicyErrorBody(e, policy), { status: uploadPolicyErrorStatus(e.limitingFactor) });
    }
    throw e;
  }

  const jobId = randomUUID();
  const inputExt = (videoFile.name.split(".").pop() ?? "mp4").toLowerCase();
  const inputPath = path.join(os.tmpdir(), `${jobId}-input.${inputExt}`);
  const outputPath = path.join(os.tmpdir(), `${jobId}-output.mp4`);
  const downloadName = `subtitle-removed-${Date.now()}.mp4`;

  fs.writeFileSync(inputPath, Buffer.from(await videoFile.arrayBuffer()));

  // Probe duration BEFORE charging — an undetectable duration means ffmpeg
  // couldn't read this file at all (corrupt/unsupported), not a valid
  // zero-length clip, so reject rather than silently proceeding.
  const durationSec = await getMediaDurationSec(inputPath);
  if (durationSec <= 0) {
    try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    return NextResponse.json(
      { error: "Couldn't read this video's duration — it may be corrupted or an unsupported format." },
      { status: 400 },
    );
  }

  const idempotencyKey = (formData.get("idempotencyKey") as string | null) ?? undefined;
  const CREDIT_COST = creditCostForDuration(durationSec);
  const charge = await chargeCredits({
    userId: auth.userId,
    amount: CREDIT_COST,
    toolSlug: "subtitle-remover",
    idempotencyKey,
    log: { generationType: "video" },
  });
  if (!charge.ok) {
    try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
    if (charge.reason === "tool_disabled") {
      return NextResponse.json({ error: "Subtitle remover is temporarily disabled." }, { status: 503 });
    }
    return NextResponse.json({ error: `Insufficient credits (need ${CREDIT_COST})` }, { status: 402 });
  }

  const job: Job = {
    progress: 5,
    status: "processing",
    inputPath,
    outputPath,
    downloadName,
    createdAt: Date.now(),
    userId: auth.userId,
    refunded: false,
    creditCost: CREDIT_COST,
    generationId: charge.generationId,
  };
  jobs.set(jobId, job);

  const framesDir = path.join(os.tmpdir(), `${jobId}-frames`);

  (async () => {
    try {
      fal.config({ credentials: env.FAL_KEY });
      fs.mkdirSync(framesDir, { recursive: true });

      // 1. Sample frames evenly across the video, capped at SAMPLE_FRAME_CAP
      // total regardless of length.
      const sampleFps = durationSec > SAMPLE_FRAME_CAP ? SAMPLE_FRAME_CAP / durationSec : 1;
      const frameIntervalSec = 1 / sampleFps;
      job.progress = 10;
      await runFFmpegArgs(["-y", "-i", inputPath, "-vf", `fps=${sampleFps}`, path.join(framesDir, "frame-%04d.png")]);
      if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);

      if ((job.status as string) === "cancelled") return;

      const frameFiles = fs.readdirSync(framesDir).filter((f) => f.endsWith(".png")).sort();

      // 2. OCR each sampled frame (small bounded concurrency), collecting
      // detected text regions with their timestamp.
      const detections: DetectedRegion[] = [];
      for (let i = 0; i < frameFiles.length; i += OCR_CONCURRENCY) {
        if ((job.status as string) === "cancelled") return;
        const batch = frameFiles.slice(i, i + OCR_CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map((f, j) => detectTextInFrame(path.join(framesDir, f), (i + j) * frameIntervalSec)),
        );
        for (const r of results) {
          if (r.status === "fulfilled") detections.push(...r.value);
          else logger.error("subtitle-remover", "OCR call failed for a sampled frame", r.reason);
        }
        job.progress = 10 + Math.round(((i + batch.length) / frameFiles.length) * 30);
        if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);
      }

      if ((job.status as string) === "cancelled") return;

      // 3. Cluster detections into stable regions, and build a filter that
      // only touches the actual detected region(s) for the time range they
      // were seen in — never the whole frame, and never when nothing was
      // detected at all.
      const clusters = clusterRegions(detections, frameIntervalSec);
      const filter = buildDelogoFilter(clusters);
      job.meta = { regionsDetected: clusters.length };

      job.progress = 45;
      const ffmpegArgs = filter
        ? ["-y", "-i", inputPath, "-vf", filter, "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-c:a", "copy", outputPath]
        // No text detected anywhere — re-encode straight through with no
        // filter rather than altering footage that doesn't need it.
        : ["-y", "-i", inputPath, "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-c:a", "copy", outputPath];

      await runFFmpegWithProgress(ffmpegArgs, (pct) => {
        job.progress = 45 + Math.round((pct / 100) * 54);
        if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);
      });

      if ((job.status as string) === "cancelled") return;

      job.progress = 100;
      job.status = "done";
      if (job.generationId) {
        void updateGenerationProgress(job.generationId, 100);
        void markGenerationStatus(job.generationId, "completed");
      }
    } catch (err) {
      if ((job.status as string) === "cancelled") return;
      job.status = "error";
      job.error = err instanceof Error ? err.message : "Subtitle removal failed";
      if (!job.refunded) {
        job.refunded = true;
        try {
          await refundCredits({ userId: job.userId, amount: job.creditCost, generationId: job.generationId });
          if (job.generationId) await markGenerationStatus(job.generationId, "failed", job.error);
        } catch { /* swallow */ }
      }
    } finally {
      try { fs.unlinkSync(inputPath); } catch { /* ignore */ }
      try { fs.rmSync(framesDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  })();

  return NextResponse.json({ jobId }, { status: 202 });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "tools:subtitle-remover" });

export const GET = withRateLimit(
  createJobStatusHandler(jobs, { contentType: "video/mp4", deleteOnDownload: true }),
  { limit: 30, windowSec: 60, keyBy: "user", name: "tools:subtitle-remover:status" },
);

export const DELETE = withRateLimit(
  createJobCancelHandler(jobs),
  { limit: 10, windowSec: 60, keyBy: "user", name: "tools:subtitle-remover:cancel" },
);
