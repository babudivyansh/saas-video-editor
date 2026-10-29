// The Node.js half of instrumentation.ts: boot diagnostics, the queue
// workers, and the restart reconciliation. Imported only on the Node.js
// runtime, so none of it is ever compiled for Edge.

export async function registerNode() {
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

  // Same idea for the queue driver: which one production actually runs was
  // unknowable from outside (docs said in-process, the code defaulted to
  // BullMQ), and the two drivers fail in different ways.
  try {
    const { env } = await import("./lib/env");
    const { logger } = await import("./lib/logger");
    logger.info("render-queue", `driver: ${env.RENDER_QUEUE_DRIVER ?? "bullmq (default)"}`);
  } catch { /* never block boot on a diagnostic */ }

  // The queue workers start at boot in production only. That module imports
  // the whole render stack (AutoClip pipeline, editor and caption renders,
  // dubbing, moderation, …), and `next dev` compiles everything an
  // instrumentation file can import before it serves its first request — a
  // minute or more of a server that has printed "Ready" and answers nothing.
  // Next replaces process.env.NODE_ENV at compile time, so in dev the import
  // is left out entirely and each queue starts as before, when the first
  // route that uses it loads (same process under the in-process driver).
  if (process.env.NODE_ENV === "production") {
    const { startWorkers } = await import("./instrumentation-workers");
    await startWorkers();
  }

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
