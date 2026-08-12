import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { chargeCredits, refundCredits, markGenerationStatus, updateGenerationProgress } from "@/lib/credits";
import { create as createYoutubeDl } from "youtube-dl-exec";
import { withRateLimit } from "@/lib/with-rate-limit";
import { ensureExecutable } from "@/lib/ensure-executable";
import { checkFreeToolDailyCap, freeToolCapResponseBody } from "@/lib/free-tool-caps";
import { logger } from "@/lib/logger";
import ffmpegStatic from "ffmpeg-static";
import fs from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { createJobStatusHandler, createJobCancelHandler, type CancellableJob } from "@/lib/job-routes";

export const maxDuration = 300;

// This route was free (0 credits) with no length limit — pure bandwidth cost
// (fetch from YouTube, re-serve to the user) with zero monetization and no
// bound on source video length. 1 credit + a 20-minute source cap keeps the
// worst case bounded and gives the tool a real (if small) unit price.
const CREDIT_COST = 1;
const MAX_SOURCE_DURATION_SEC = 20 * 60; // 20 minutes

// ── yt-dlp binary (bundled by youtube-dl-exec) ────────────────────────────────
const YT_DLP_BIN = path.join(
  process.cwd(),
  "node_modules",
  "youtube-dl-exec",
  "bin",
  process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"
);
// Standalone deploys can strip the binary's execute bit → spawn EACCES.
ensureExecutable(YT_DLP_BIN);
const ytDlp = createYoutubeDl(YT_DLP_BIN);

// ── ffmpeg binary for merging/audio extraction ────────────────────────────────
function resolveFfmpegDir(): string | undefined {
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) return path.dirname(ffmpegStatic);
  const bin = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const cwdPath = path.join(process.cwd(), "node_modules", "ffmpeg-static", bin);
  if (fs.existsSync(cwdPath)) return path.dirname(cwdPath);
  return undefined;
}
const FFMPEG_DIR = resolveFfmpegDir();

// Quality sort order for presentation
const Q_ORDER = [2160, 1440, 1080, 720, 480, 360, 240, 144];

function extractVideoId(url: string): string | null {
  const patterns = [
    /[?&]v=([^&#]+)/,
    /youtu\.be\/([^?&#]+)/,
    /shorts\/([^?&#]+)/,
    /embed\/([^?&#]+)/,
    /live\/([^?&#]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

function safeTitle(title: string): string {
  return title.replace(/[^\w\s-]/g, "").trim().substring(0, 80) || "video";
}

interface YtFormat {
  height?: number | null;
  vcodec?: string | null;
  acodec?: string | null;
}
interface YtInfo {
  title?: string;
  duration?: number;
  uploader?: string;
  channel?: string;
  thumbnail?: string;
  view_count?: number;
  formats?: YtFormat[];
}

// isAudio distinguishes the two possible output content types this tool can
// produce for the same job map — see job-routes.ts's contentType-as-function
// option, added specifically to support this.
interface Job extends CancellableJob {
  status: "processing" | "done" | "error" | "cancelled";
  userId: string;
  createdAt: number;
  isAudio: boolean;
}

const g = globalThis as unknown as { __ytdlJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__ytdlJobs ?? (g.__ytdlJobs = new Map());

function sweep() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      try { fs.unlinkSync(job.outputPath); } catch { /* ignore */ }
      jobs.delete(id);
    }
  }
}

// ── GET handler ───────────────────────────────────────────────────────────────
// GET ?url=...&action=info    → JSON metadata + available formats
// GET ?url=...&quality=720    → starts a download job, returns { jobId }
// GET ?jobId=...              → poll status / (with &download=1) stream the file
async function handleGET(req: NextRequest) {
  sweep();

  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);

  // Poll / download an already-started job — delegate to the shared handler.
  if (searchParams.has("jobId")) {
    return jobStatusHandler(req);
  }

  const rawUrl  = searchParams.get("url")?.trim() ?? "";
  const action  = searchParams.get("action");
  const quality = searchParams.get("quality") ?? "best";
  const idempotencyKey = searchParams.get("idempotencyKey")?.trim() || undefined;

  const videoId = extractVideoId(rawUrl);
  if (!videoId) {
    return NextResponse.json({ error: "Invalid or unsupported YouTube URL" }, { status: 400 });
  }
  const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // ── Info mode ───────────────────────────────────────────────────────────────
  if (action === "info") {
    try {
      const info = (await ytDlp(cleanUrl, {
        dumpSingleJson: true,
        noWarnings: true,
        noCheckCertificates: true,
        noPlaylist: true,
      })) as unknown as YtInfo;

      const heights = [
        ...new Set(
          (info.formats ?? [])
            .filter(f => f.vcodec && f.vcodec !== "none" && f.height)
            .map(f => f.height as number)
        ),
      ].sort((a, b) => Q_ORDER.indexOf(a) - Q_ORDER.indexOf(b));

      const formats = heights.map(h => ({
        label: `${h}p`,
        quality: String(h),
        mux: true,
      }));
      formats.push({ label: "MP3 (Audio Only)", quality: "audio", mux: false });

      return NextResponse.json({
        title: info.title ?? "Untitled",
        author: info.uploader ?? info.channel ?? "",
        duration: info.duration ?? 0,
        thumbnail: info.thumbnail ?? "",
        viewCount: info.view_count ?? 0,
        formats,
      });
    } catch (err) {
      const e = err as { stderr?: string; message?: string };
      const msg = e.stderr?.split("\n").find(l => l.includes("ERROR")) ?? e.message ?? "Failed to fetch video info";
      logger.error("yt-dl-info", "info fetch failed", e.stderr ?? msg);
      return NextResponse.json({ error: msg.replace(/^ERROR:\s*/, "") }, { status: 500 });
    }
  }

  // ── Start a download job ───────────────────────────────────────────────────
  // Daily cap on actual downloads (info/status polling stays uncapped).
  const daily = await checkFreeToolDailyCap("youtube-downloader", auth.userId);
  if (!daily.allowed) {
    return NextResponse.json(freeToolCapResponseBody("youtube-downloader", daily.cap), { status: 429 });
  }

  const jobId = randomUUID();
  const isAudio = quality === "audio";
  const ext = isAudio ? "mp3" : "mp4";
  // yt-dlp fills in the real extension via the %(ext)s template
  const outTemplate = path.join(os.tmpdir(), `ytdl_${jobId}.%(ext)s`);
  const finalPath = path.join(os.tmpdir(), `ytdl_${jobId}.${ext}`);

  let title = "video";
  try {
    // Resolve the title first (for a nice filename) and check length before charging.
    const meta = (await ytDlp(cleanUrl, {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificates: true,
      noPlaylist: true,
    })) as unknown as YtInfo;
    title = safeTitle(meta.title ?? "video");

    if ((meta.duration ?? 0) > MAX_SOURCE_DURATION_SEC) {
      return NextResponse.json(
        { error: `Video is too long (${Math.round(meta.duration ?? 0)}s). Max is ${MAX_SOURCE_DURATION_SEC / 60} minutes.` },
        { status: 400 },
      );
    }
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    const stderrLine = e.stderr?.split("\n").find(l => l.includes("ERROR"));
    const msg = stderrLine?.replace(/^ERROR:\s*/, "") ?? e.message ?? "Failed to fetch video info";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const charge = await chargeCredits({
    userId: auth.userId,
    amount: CREDIT_COST,
    toolSlug: "youtube-downloader",
    idempotencyKey,
    log: { generationType: "video", prompt: cleanUrl },
  });
  if (!charge.ok) {
    if (charge.reason === "tool_disabled") {
      return NextResponse.json({ error: "YouTube downloader is temporarily disabled." }, { status: 503 });
    }
    return NextResponse.json({ error: `Insufficient credits (need ${CREDIT_COST})` }, { status: 402 });
  }

  const job: Job = {
    progress: 10,
    status: "processing",
    outputPath: finalPath,
    downloadName: `${title}.${ext}`,
    createdAt: Date.now(),
    userId: auth.userId,
    refunded: false,
    creditCost: CREDIT_COST,
    generationId: charge.generationId,
    isAudio,
  };
  jobs.set(jobId, job);

  (async () => {
    // Simulated progress — yt-dlp's own progress isn't cheaply available
    // without parsing stdout, matching the same tradeoff already made for
    // fal.ai-backed tools elsewhere in this file's sibling routes.
    const ticker = setInterval(() => {
      if (job.progress < 88) job.progress += 4;
      if (job.generationId) void updateGenerationProgress(job.generationId, job.progress);
    }, 4000);

    try {
      if (isAudio) {
        await ytDlp(cleanUrl, {
          format: "bestaudio/best",
          extractAudio: true,
          audioFormat: "mp3",
          audioQuality: 0,
          output: outTemplate,
          ffmpegLocation: FFMPEG_DIR,
          noWarnings: true,
          noCheckCertificates: true,
          noPlaylist: true,
        });
      } else {
        const h = /^\d+$/.test(quality) ? quality : "9999";
        await ytDlp(cleanUrl, {
          format: `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${h}]+bestaudio/best[height<=${h}][ext=mp4]/best`,
          mergeOutputFormat: "mp4",
          output: outTemplate,
          ffmpegLocation: FFMPEG_DIR,
          noWarnings: true,
          noCheckCertificates: true,
          noPlaylist: true,
        });
      }

      if ((job.status as string) === "cancelled") return;

      if (!fs.existsSync(finalPath)) {
        // Fall back: find whatever file yt-dlp actually produced for this job,
        // and rename it to the canonical path job.outputPath already points at.
        const dir = os.tmpdir();
        const produced = fs.readdirSync(dir).find(f => f.startsWith(`ytdl_${jobId}.`));
        if (!produced) throw new Error("Download produced no output file");
        fs.renameSync(path.join(dir, produced), finalPath);
      }

      job.progress = 100;
      job.status = "done";
      if (job.generationId) {
        void updateGenerationProgress(job.generationId, 100);
        void markGenerationStatus(job.generationId, "completed");
      }
    } catch (err) {
      if ((job.status as string) === "cancelled") return;
      const e = err as { stderr?: string; message?: string };
      const stderrLine = e.stderr?.split("\n").find(l => l.includes("ERROR"));
      const msg = stderrLine?.replace(/^ERROR:\s*/, "") ?? e.message ?? "Download failed";
      logger.error("yt-dl", "download failed", e.stderr ?? msg);
      job.status = "error";
      job.error = msg;
      if (!job.refunded) {
        job.refunded = true;
        try {
          await refundCredits({ userId: auth.userId, amount: CREDIT_COST, generationId: job.generationId });
          if (job.generationId) await markGenerationStatus(job.generationId, "failed", msg);
        } catch { /* swallow */ }
      }
      // Clean up any partial files.
      try {
        const dir = os.tmpdir();
        for (const f of fs.readdirSync(dir)) {
          if (f.startsWith(`ytdl_${jobId}.`)) fs.promises.unlink(path.join(dir, f)).catch(() => {});
        }
      } catch { /* ignore cleanup errors */ }
    } finally {
      clearInterval(ticker);
    }
  })();

  return NextResponse.json({ jobId }, { status: 202 });
}

const jobStatusHandler = createJobStatusHandler(jobs, {
  contentType: (job) => (job.isAudio ? "audio/mpeg" : "video/mp4"),
  deleteOnDownload: true,
});

// Shares one bucket across info/start-job calls AND the ~2s-interval status
// polling useJobPolling does while a job is in flight (unlike other tools,
// this route can't export a second GET with its own :status bucket — jobId
// presence is dispatched on inside a single handler) — sized generously
// enough that a few minutes of polling never starves a real info/start call.
export const GET = withRateLimit(handleGET, { limit: 60, windowSec: 60, keyBy: "user", name: "tools:youtube-downloader" });

export const DELETE = withRateLimit(
  createJobCancelHandler(jobs),
  { limit: 10, windowSec: 60, keyBy: "user", name: "tools:youtube-downloader:cancel" },
);
