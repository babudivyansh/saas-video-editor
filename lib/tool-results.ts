import { randomUUID } from "crypto";
import fs from "fs";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AssetLimitError, adoptExistingS3Object } from "@/lib/asset-service";
import { parseS3Url } from "@/lib/s3-url";
import { uploadBufferToS3, uploadFileToS3 } from "@/utils/s3-upload";

// What an AI tool job made, saved where it outlives the job (2026-10, mobile
// Phase 5.5). The tool routes keep their job in a `globalThis` Map that a
// restart wipes, and two of them leave their output on local disk; this puts
// the output in S3, saves it to the user's Assets library (source = the tool,
// sourceJobId = the Generation), and records both on the Generation row, so
// any client can read a finished job from the database.
//
// Best-effort by design: a job that produced its output has succeeded, so a
// failure here is logged and never turns into a failed, refunded job. Over the
// storage quota, the result is still recorded, just not added to the library.

export type ToolResultSlug = "image-generator" | "voiceover" | "enhance-speech" | "vocal-remover" | "voice-changer" | "background-remover" | "face-swap" | "subtitle-remover";

export interface ToolResultInput {
  userId: string;
  generationId?: string | null;
  toolSlug: ToolResultSlug;
  /** An object already in our bucket, bytes to store, or a file on disk to stream up (videos). */
  source: { s3Url: string } | { buffer: Buffer } | { filePath: string };
  mimeType: string;
  /** File name in the library ("neon city.png"). */
  name: string;
  durationMs?: number;
  /** Extra details kept on the result (model, voice, characters…). */
  meta?: Record<string, unknown>;
}

export interface ToolResult {
  url: string | null;
  assetId: string | null;
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "audio/mpeg": "mp3", "audio/wav": "wav", "video/mp4": "mp4" };

export async function saveToolResult(o: ToolResultInput): Promise<ToolResult> {
  let url: string | null = null;
  let assetId: string | null = null;
  try {
    let size: number | undefined;
    if ("buffer" in o.source) {
      const key = `tool-results/${o.userId}/${randomUUID()}.${EXT[o.mimeType] ?? "bin"}`;
      url = await uploadBufferToS3(o.source.buffer, key, o.mimeType, o.name);
      size = o.source.buffer.length;
    } else if ("filePath" in o.source) {
      const key = `tool-results/${o.userId}/${randomUUID()}.${EXT[o.mimeType] ?? "bin"}`;
      url = await uploadFileToS3(o.source.filePath, key, o.mimeType);
      size = fs.statSync(o.source.filePath).size;
    } else {
      url = o.source.s3Url;
    }

    const loc = parseS3Url(url);
    if (loc) {
      try {
        const adopted = await adoptExistingS3Object({
          userId: o.userId,
          s3Key: loc.key,
          mimeType: o.mimeType,
          name: o.name,
          size,
          sourceFeature: o.toolSlug,
          sourceJobId: o.generationId ?? undefined,
          duration: o.durationMs != null ? o.durationMs / 1000 : null,
        });
        assetId = adopted.asset.id;
      } catch (e) {
        if (e instanceof AssetLimitError) logger.warn("tool-results", `not added to library (${e.kind}) for ${o.toolSlug}`, { userId: o.userId });
        else throw e;
      }
    }

    if (o.generationId) {
      await prisma.generation.update({
        where: { id: o.generationId },
        data: { result: { url, mimeType: o.mimeType, name: o.name, ...(o.durationMs != null ? { durationMs: o.durationMs } : {}), ...(o.meta ?? {}) }, resultAssetId: assetId },
      });
    }
  } catch (e) {
    logger.error("tool-results", `saving the ${o.toolSlug} result failed`, e);
  }
  return { url, assetId };
}
