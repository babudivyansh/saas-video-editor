// Storage for a source video's face/speaker timeline.
//
// This used to live in Project.faceTimeline as a raw JSON column. Face
// detection samples several times per second, so a 6-hour podcast — which the
// Studio tier explicitly sells — produces well into six figures of objects.
// That is not a column value: it bloats every Project row read, has to be
// parsed in full to use any part of it, and is held entirely in worker memory.
//
// Timelines now go to S3 as a gzipped sidecar with a pointer in the column.
// Two size reductions happen before writing, neither of them visible in the
// output: samples are thinned to SAMPLE_HZ (the crop path is smoothed over
// half-second buckets anyway, so finer input changes nothing), and
// coordinates are rounded to a thousandth of a frame — sub-pixel at 1080p.

import { Prisma } from "@prisma/client";
import { gzipSync, gunzipSync } from "zlib";
import { prisma } from "@/lib/prisma";
import { uploadBufferToS3, downloadS3ObjectToFile, getS3ObjectSize } from "@/utils/s3-upload";
import { logger } from "@/lib/logger";
import type { FaceBox } from "@/lib/reframe";
import os from "os";
import path from "path";
import fs from "fs";

const SAMPLE_HZ = 5;
const COORD_PRECISION = 1000;

export const faceTimelineKey = (projectId: string) => `face-timelines/${projectId}.json.gz`;

/** Marker written to Project.faceTimeline when the samples live in S3. */
interface SidecarPointer { v: 1; key: string; count: number }

function isPointer(value: unknown): value is SidecarPointer {
  return !!value && typeof value === "object" && (value as SidecarPointer).v === 1
    && typeof (value as SidecarPointer).key === "string";
}

/** Thin + round. Exported for tests: the reduction must not change framing. */
export function compactTimeline(faces: FaceBox[]): FaceBox[] {
  const round = (n: number) => Math.round(n * COORD_PRECISION) / COORD_PRECISION;
  const bucketOf = (tSec: number) => Math.round(tSec * SAMPLE_HZ);

  // Keep the highest-confidence sample per (track, time bucket) rather than
  // the first: the crop path already picks the best sample per bucket, so
  // discarding a better one here would change the result.
  const best = new Map<string, FaceBox>();
  for (const f of faces) {
    const key = `${f.trackId ?? ""}:${bucketOf(f.tSec)}`;
    const prev = best.get(key);
    if (!prev || f.confidence > prev.confidence) best.set(key, f);
  }

  return [...best.values()]
    .map((f) => ({
      ...f,
      tSec: round(f.tSec),
      x: round(f.x), y: round(f.y), w: round(f.w), h: round(f.h),
      confidence: Math.round(f.confidence),
      ...(f.speaking != null ? { speaking: round(f.speaking) } : {}),
    }))
    .sort((a, b) => a.tSec - b.tSec);
}

export async function saveFaceTimeline(projectId: string, faces: FaceBox[]): Promise<void> {
  try {
    const compact = compactTimeline(faces);
    const gz = gzipSync(Buffer.from(JSON.stringify(compact), "utf8"));
    const key = faceTimelineKey(projectId);
    await uploadBufferToS3(gz, key, "application/gzip");
    const pointer: SidecarPointer = { v: 1, key, count: compact.length };
    await prisma.project.update({
      where: { id: projectId },
      data: { faceTimeline: pointer as unknown as Prisma.InputJsonValue },
    });
    logger.info("face-timeline", `stored ${compact.length} samples (${gz.length}B gz) for ${projectId}`);
  } catch (err) {
    // Caching is an optimisation: a failure here costs a re-detection on the
    // next run, never a failed render.
    logger.warn("face-timeline", `failed to persist timeline for ${projectId}`, err);
  }
}

/**
 * Read a cached timeline, transparently handling both the current sidecar
 * pointer and the legacy inline-array form written before this module existed.
 * Returns null when there's nothing cached.
 */
export async function loadFaceTimeline(
  project: { id: string; faceTimeline: unknown },
): Promise<FaceBox[] | null> {
  const value = project.faceTimeline;
  if (!value) return null;

  // Legacy rows hold the array inline. Still perfectly usable — just read it.
  if (Array.isArray(value)) return value as unknown as FaceBox[];
  if (!isPointer(value)) return null;

  const tmpPath = path.join(os.tmpdir(), `face-timeline-${project.id}.json.gz`);
  try {
    // Skip the download entirely if the object has gone (lifecycle rule, manual
    // cleanup) — re-detecting is cheaper than a failed read mid-pipeline.
    const size = await getS3ObjectSize(value.key).catch(() => 0);
    if (!size) return null;
    await downloadS3ObjectToFile(value.key, tmpPath);
    return JSON.parse(gunzipSync(fs.readFileSync(tmpPath)).toString("utf8")) as FaceBox[];
  } catch (err) {
    logger.warn("face-timeline", `failed to read sidecar for ${project.id}, re-detecting`, err);
    return null;
  } finally {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
  }
}
