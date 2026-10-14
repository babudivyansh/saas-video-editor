import { ApiError } from "@/app/dashboard/create/auto-clip/_components/shared";

// When a project's clips page stops polling. A pure function of the query's
// last-known data, so the decision is testable without timers — react-query
// calls it on its own schedule. (Moved from the old AutoClip results page.)
export function autoClipPollIntervalMs(
  data: { project: { status: string }; clips: { status: string }[] } | undefined,
  error?: unknown,
): number | false {
  // A project that isn't there (deleted, or discarded after a refused start)
  // will not appear by asking again. This polled a 404 every 2.5s forever.
  if (error instanceof ApiError && error.status === 404) return false;
  if (!data) return 2500;
  const settled = data.project.status === "completed" || data.project.status === "failed";
  const inFlight = data.clips.some((c) => c.status === "queued" || c.status === "rendering");
  return !settled || inFlight ? 2500 : false;
}
