// Next.js startup hook. Used to launch the optional always-on Social Tracker
// refresh worker (no-op unless SOCIAL_REFRESH_DRIVER=bullmq). Guarded to the
// Node.js runtime so it never loads server-only deps on the Edge runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startSocialRefreshWorker } = await import("./lib/social/refresh-queue");
  startSocialRefreshWorker();
}
