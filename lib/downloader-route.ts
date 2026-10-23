import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import ffmpegStatic from "ffmpeg-static";
import { create as createYoutubeDl } from "youtube-dl-exec";
import { getAuthUser } from "@/lib/auth";
import { chargeCredits, refundCredits, markGenerationStatus, updateGenerationProgress } from "@/lib/credits";
import { checkFreeToolDailyCap, freeToolCapResponseBody } from "@/lib/free-tool-caps";
import { createJobStatusHandler, createJobCancelHandler, idempotencyResponse, type CancellableJob } from "@/lib/job-routes";
import { ensureExecutable } from "@/lib/ensure-executable";
import { logger } from "@/lib/logger";
import { withRateLimit } from "@/lib/with-rate-limit";

// The YouTube and Instagram downloaders, written once (2026-10-14 tools audit).
//
// They were two hand-copied routes that had drifted apart: YouTube ran a job
// and billed through chargeCredits; Instagram downloaded inside one GET request
// (up to 5 minutes), billed through spendCredits directly — no Generation row,
// no idempotency (a double-click charged twice), and no admin kill switch —
// and leaked a temp file whenever the client never read the stream. Both
// started paid work from a GET, disabled TLS certificate checks
// (noCheckCertificates) on every yt-dlp call, and returned raw yt-dlp stderr.
//
// Now: GET ?action=info (free metadata) and GET ?jobId (poll / streamed
// download), POST { url, quality, idempotencyKey } starts a charged job,
// DELETE ?jobId cancels and refunds.

const CREDIT_COST = 1;
const MAX_SOURCE_DURATION_SEC = 20 * 60;
const Q_ORDER = [2160, 1440, 1080, 720, 480, 360, 240, 144];

// ── yt-dlp + ffmpeg binaries ─────────────────────────────────────────────────
const YT_DLP_BIN = path.join(
  process.cwd(),
  "node_modules",
  "youtube-dl-exec",
  "bin",
  process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp",
);
// Standalone deploys can strip the binary's execute bit → spawn EACCES.
ensureExecutable(YT_DLP_BIN);
const ytDlp = createYoutubeDl(YT_DLP_BIN);

function resolveFfmpegDir(): string | undefined {
  const candidate = (ffmpegStatic && fs.existsSync(ffmpegStatic))
    ? ffmpegStatic
    : path.join(process.cwd(), "node_modules", "ffmpeg-static", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  if (!fs.existsSync(candidate)) return undefined;
  ensureExecutable(candidate);
  return path.dirname(candidate);
}
const FFMPEG_DIR = resolveFfmpegDir();

// Certificate checks stay ON: these calls fetch media from the open internet.
// socketTimeout: seconds without data before yt-dlp gives up on a stalled host.
const COMMON_OPTS = { noWarnings: true, noPlaylist: true, socketTimeout: 30 } as const;

export interface YtFormat { height?: number | null; vcodec?: string | null }
export interface YtInfo {
  title?: string;
  description?: string;
  duration?: number;
  uploader?: string;
  uploader_id?: string;
  channel?: string;
  thumbnail?: string;
  view_count?: number;
  like_count?: number;
  formats?: YtFormat[];
}

export function videoHeights(info: YtInfo): number[] {
  return [
    ...new Set((info.formats ?? []).filter((f) => f.vcodec && f.vcodec !== "none" && f.height).map((f) => f.height as number)),
  ].sort((a, b) => Q_ORDER.indexOf(a) - Q_ORDER.indexOf(b));
}

export function safeTitle(title: string, fallback: string): string {
  return title.replace(/[^\w\s-]/g, "").trim().substring(0, 80) || fallback;
}

export interface DownloaderConfig {
  slug: "youtube-downloader" | "instagram-downloader";
  /** For messages: "YouTube downloader". */
  label: string;
  /** Temp-file prefix, unique per tool. */
  filePrefix: string;
  /** The canonical URL to hand yt-dlp, or null when the input isn't one this tool accepts. */
  normalizeUrl(raw: string): string | null;
  invalidUrlMessage: string;
  /** The ?action=info response body. */
  infoBody(info: YtInfo): Record<string, unknown>;
  /** A user-facing message for a yt-dlp failure (the raw text is only logged). */
  friendlyError(raw: string): string;
  /** Filename (without extension) for a finished download. */
  downloadBaseName(info: YtInfo): string;
}

interface Job extends CancellableJob {
  status: "processing" | "done" | "error" | "cancelled";
  userId: string;
  createdAt: number;
  isAudio: boolean;
}

function ytErrorText(err: unknown): string {
  const e = err as { stderr?: string; message?: string };
  return e.stderr?.split("\n").find((l) => l.includes("ERROR"))?.replace(/^ERROR:\s*/, "") ?? e.message ?? "";
}

export function createDownloaderRoute(cfg: DownloaderConfig) {
  const g = globalThis as unknown as Record<string, Map<string, Job> | undefined>;
  const mapKey = `__downloaderJobs_${cfg.slug}`;
  const jobs: Map<string, Job> = g[mapKey] ?? (g[mapKey] = new Map());

  function sweep() {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [id, job] of jobs) {
      if (job.createdAt < cutoff) {
        try { fs.unlinkSync(job.outputPath); } catch { /* ignore */ }
        jobs.delete(id);
      }
    }
  }

  const jobStatusHandler = createJobStatusHandler(jobs, {
    contentType: (job) => (job.isAudio ? "audio/mpeg" : "video/mp4"),
    deleteOnDownload: true,
  });

  async function fetchInfo(url: string): Promise<YtInfo> {
    return (await ytDlp(url, { ...COMMON_OPTS, dumpSingleJson: true })) as unknown as YtInfo;
  }

  async function handleGET(req: NextRequest) {
    sweep();
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    if (searchParams.has("jobId")) return jobStatusHandler(req);

    if (searchParams.get("action") !== "info") {
      // Starting a download charges a credit, so it is a POST — a GET can be
      // triggered by a plain link or navigation.
      return NextResponse.json({ error: "Start a download with POST." }, { status: 405, headers: { Allow: "GET, POST, DELETE" } });
    }

    const url = cfg.normalizeUrl(searchParams.get("url")?.trim() ?? "");
    if (!url) return NextResponse.json({ error: cfg.invalidUrlMessage }, { status: 400 });

    try {
      return NextResponse.json(cfg.infoBody(await fetchInfo(url)));
    } catch (err) {
      const raw = ytErrorText(err);
      logger.error(cfg.slug, "info fetch failed", raw);
      return NextResponse.json({ error: cfg.friendlyError(raw) }, { status: 502 });
    }
  }

  async function handlePOST(req: NextRequest) {
    sweep();
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: { url?: string; quality?: string; idempotencyKey?: string };
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }

    const url = cfg.normalizeUrl((body.url ?? "").trim());
    if (!url) return NextResponse.json({ error: cfg.invalidUrlMessage }, { status: 400 });
    const quality = String(body.quality ?? "best");
    const isAudio = quality === "audio";
    const height = /^\d{3,4}$/.test(quality) ? quality : "9999";
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() || undefined : undefined;

    const daily = await checkFreeToolDailyCap(cfg.slug, auth.userId);
    if (!daily.allowed) return NextResponse.json(freeToolCapResponseBody(cfg.slug, daily.cap), { status: 429 });

    // Title for the filename, and the length check, before charging.
    let meta: YtInfo;
    try {
      meta = await fetchInfo(url);
    } catch (err) {
      const raw = ytErrorText(err);
      logger.error(cfg.slug, "info fetch failed", raw);
      return NextResponse.json({ error: cfg.friendlyError(raw) }, { status: 502 });
    }
    if ((meta.duration ?? 0) > MAX_SOURCE_DURATION_SEC) {
      return NextResponse.json(
        { error: `This video is too long (${Math.round(meta.duration ?? 0)}s). The limit is ${MAX_SOURCE_DURATION_SEC / 60} minutes.` },
        { status: 400 },
      );
    }

    const charge = await chargeCredits({
      userId: auth.userId,
      amount: CREDIT_COST,
      toolSlug: cfg.slug,
      idempotencyKey,
      log: { generationType: "video", prompt: url },
    });
    const replayed = idempotencyResponse(charge, jobs);
    if (replayed) return replayed;
    if (!charge.ok) {
      if (charge.reason === "tool_disabled") {
        return NextResponse.json({ error: `The ${cfg.label} is temporarily disabled.` }, { status: 503 });
      }
      return NextResponse.json({ error: `Insufficient credits (need ${CREDIT_COST})` }, { status: 402 });
    }

    const jobId = randomUUID();
    const ext = isAudio ? "mp3" : "mp4";
    const outTemplate = path.join(os.tmpdir(), `${cfg.filePrefix}_${jobId}.%(ext)s`);
    const finalPath = path.join(os.tmpdir(), `${cfg.filePrefix}_${jobId}.${ext}`);
    const job: Job = {
      progress: 10,
      status: "processing",
      outputPath: finalPath,
      downloadName: `${cfg.downloadBaseName(meta)}.${ext}`,
      createdAt: Date.now(),
      userId: auth.userId,
      refunded: false,
      creditCost: CREDIT_COST,
      generationId: charge.generationId,
      isAudio,
    };
    jobs.set(jobId, job);

    (async () => {
      // yt-dlp's own progress isn't cheaply available without parsing stdout.
      const ticker = setInterval(() => {
        if (job.progress < 88) job.progress += 4;
        if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);
      }, 4000);
      try {
        await ytDlp(url, isAudio
          ? { ...COMMON_OPTS, format: "bestaudio/best", extractAudio: true, audioFormat: "mp3", audioQuality: 0, output: outTemplate, ffmpegLocation: FFMPEG_DIR }
          : {
              ...COMMON_OPTS,
              format: `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best[height<=${height}][ext=mp4]/best`,
              mergeOutputFormat: "mp4",
              output: outTemplate,
              ffmpegLocation: FFMPEG_DIR,
            });
        if ((job.status as string) === "cancelled") return;

        if (!fs.existsSync(finalPath)) {
          // yt-dlp picks the real extension via %(ext)s — find what it wrote.
          const produced = fs.readdirSync(os.tmpdir()).find((f) => f.startsWith(`${cfg.filePrefix}_${jobId}.`));
          if (!produced) throw new Error("Download produced no output file");
          fs.renameSync(path.join(os.tmpdir(), produced), finalPath);
        }

        job.progress = 100;
        job.status = "done";
        if (job.generationId) {
          void updateGenerationProgress(job.generationId, 100);
          void markGenerationStatus(job.generationId, "completed");
        }
      } catch (err) {
        if ((job.status as string) === "cancelled") return;
        const raw = ytErrorText(err);
        logger.error(cfg.slug, "download failed", raw);
        job.status = "error";
        job.error = cfg.friendlyError(raw);
        if (!job.refunded) {
          job.refunded = true;
          try {
            await refundCredits({ userId: auth.userId, amount: CREDIT_COST, generationId: job.generationId });
            if (job.generationId) await markGenerationStatus(job.generationId, "failed", raw.slice(0, 500));
          } catch (e) { logger.error(cfg.slug, "refund failed", e); }
        }
        try {
          for (const f of fs.readdirSync(os.tmpdir())) {
            if (f.startsWith(`${cfg.filePrefix}_${jobId}.`)) fs.promises.unlink(path.join(os.tmpdir(), f)).catch(() => {});
          }
        } catch { /* ignore cleanup errors */ }
      } finally {
        clearInterval(ticker);
      }
    })();

    return NextResponse.json({ jobId, generationId: charge.generationId }, { status: 202 });
  }

  return {
    // One bucket for info + polling (~2s while a job runs), sized so a few
    // minutes of polling never starves a real info call.
    GET: withRateLimit(handleGET, { limit: 60, windowSec: 60, keyBy: "user", name: `tools:${cfg.slug}` }),
    POST: withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: `tools:${cfg.slug}:start` }),
    DELETE: withRateLimit(createJobCancelHandler(jobs), { limit: 10, windowSec: 60, keyBy: "user", name: `tools:${cfg.slug}:cancel` }),
  };
}
