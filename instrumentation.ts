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
  const { startSocialRefreshWorker } = await import("./lib/social/refresh-queue");
  startSocialRefreshWorker();

  // Start the editor-render BullMQ worker at boot (default driver — see
  // lib/render-queue.ts) rather than waiting for the first render request to
  // import the route module. createRenderQueue is cached by name, so this and
  // app/api/editor/render/route.ts's own call resolve to the same Queue/Worker.
  const { createRenderQueue } = await import("./lib/render-queue");
  const { editorRenderJob } = await import("./lib/editor/render-job");
  createRenderQueue("editor-render", editorRenderJob);
}

export const onRequestError: Instrumentation.onRequestError = Sentry.captureRequestError;
