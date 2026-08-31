import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";

// Next.js startup hook. Used to validate required env vars fail-fast, launch
// the optional always-on Social Tracker refresh worker (no-op unless
// SOCIAL_REFRESH_DRIVER=bullmq), and initialize Sentry (no-op unless
// SENTRY_DSN is set). Worker load is guarded to the Node.js runtime so it
// never loads server-only deps on the Edge runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./lib/env");
    validateEnv();
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    enabled: !!process.env.SENTRY_DSN,
  });

  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Say once, at boot, where ffmpeg came from. Without this a missing binary
  // is invisible until it surfaces as an unreadable-video error attributed to
  // the user's upload — which is exactly how it surfaced in production.
  try {
    const { ffmpegBinaryInfo } = await import("./utils/ffmpeg-render");
    const { logger } = await import("./lib/logger");
    const info = ffmpegBinaryInfo();
    if (info.bundled) logger.info("ffmpeg", `using bundled binary at ${info.path}`);
    else logger.error("ffmpeg", `bundled binary NOT found — falling back to "${info.path}" on PATH. Video probing and rendering will fail if it is absent.`);
  } catch { /* never block boot on a diagnostic */ }

  const { startSocialRefreshWorker } = await import("./lib/social/refresh-queue");
  startSocialRefreshWorker();

  // Start every known render queue's Worker here at boot instead of waiting
  // for the first request that happens to load that particular route module.
  // createRenderQueue is cached by name (queueCache in lib/render-queue.ts),
  // so this and each route file's own top-level call resolve to the same
  // Queue/Worker — previously only editor-render got this eager-start
  // treatment. On a host that runs/recycles multiple Node processes, a queue
  // like auto-clip-rerender could have jobs enqueued from a process that
  // never happened to load a route touching it, leaving the job stuck at
  // BullMQ's "waiting" state with no live Worker.
  const { createRenderQueue } = await import("./lib/render-queue");
  const { editorRenderJob } = await import("./lib/editor/render-job");
  const { pickJob, renderJob, rerenderJob } = await import("./lib/autoclip-pipeline");
  const { startDubJob, finishDubJob } = await import("./lib/autoclip-dub");
  const { assetModerationJob } = await import("./lib/asset-moderation");
  const { assetZipJob } = await import("./lib/asset-zip");
  const { accountExportJob } = await import("./lib/account-export");

  createRenderQueue("editor-render", editorRenderJob);
  createRenderQueue("auto-clip-pick", pickJob);
  createRenderQueue("auto-clip-render", renderJob);
  createRenderQueue("auto-clip-rerender", rerenderJob);
  createRenderQueue("auto-clip-dub", startDubJob);
  createRenderQueue("auto-clip-dub-finish", finishDubJob);
  createRenderQueue("asset-moderation", assetModerationJob);
  createRenderQueue("asset-zip", assetZipJob);
  createRenderQueue("account-export", accountExportJob);
  // video-compressor's handler is an inline closure over that route file's
  // own in-process job map, not a standalone exported function like the ones
  // above — importing the route module runs its own top-level
  // createRenderQueue(...) as a side effect (idempotent via queueCache), same
  // as the first lazy hit does today.
  await import("@/app/api/tools/video-compressor/route");
  // Keep this list in sync with KNOWN_RENDER_QUEUE_NAMES in lib/render-queue.ts.

  // Refund + fail tool/generator jobs orphaned by the restart we just booted
  // from. Their in-process job map doesn't survive a restart, so the Generation
  // row is left "pending" with the credits unrefunded and nothing to finalize
  // it. Best-effort — never block boot (e.g. DB not yet reachable).
  try {
    const { reconcileOrphanedToolJobs } = await import("./lib/reconcile-tool-jobs");
    const { logger } = await import("./lib/logger");
    const n = await reconcileOrphanedToolJobs();
    if (n > 0) logger.warn("boot", `reconciled ${n} tool job(s) orphaned by a restart`);
  } catch { /* never block boot on reconciliation */ }
}

export const onRequestError: Instrumentation.onRequestError = Sentry.captureRequestError;
