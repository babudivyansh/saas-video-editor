// Starts every background worker at boot (production only — see
// instrumentation-node.ts for why dev leaves this out).

export async function startWorkers() {
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
  // Social Studio "post now" (lib/social/publish-queue.ts; the clip-publish
  // cron is the fallback when an enqueue is lost).
  const { socialPublishJob } = await import("./lib/social/publish-queue");
  createRenderQueue("social-publish", socialPublishJob);
  // Created at that module's top level (like video-compressor below); it was
  // the one name in KNOWN_RENDER_QUEUE_NAMES never started at boot, so a scan
  // enqueued from a process that hadn't loaded it sat in "waiting" forever.
  await import("./lib/reviews/attachment-moderation");
  // video-compressor's handler is an inline closure over that route file's
  // own in-process job map, not a standalone exported function like the ones
  // above — importing the route module runs its own top-level
  // createRenderQueue(...) as a side effect (idempotent via queueCache), same
  // as the first lazy hit does today.
  await import("@/app/api/tools/video-compressor/route");
  // Keep this list in sync with KNOWN_RENDER_QUEUE_NAMES in lib/render-queue.ts.
}
