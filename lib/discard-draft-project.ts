// Removes a project that was created moments ago for a run that then failed
// before analysis ever started.
//
// Every Auto Clip entry point creates the project row first and only then
// imports/uploads the video. When that second step failed the catch blocks
// only rendered an error message, so the empty draft survived — and because
// each retry created another one, a user who hit a bad URL twice ended up with
// two identically-titled "0 clips" cards permanently occupying their
// "Continue where you left off" rail.

/**
 * Deletes the project only if it is still an untouched `draft`.
 *
 * The status check is the whole point and is deliberately inside this helper
 * rather than left to callers: once the pipeline claims a project it flips it
 * to `analyzing` (app/api/generate/auto-clip/route.ts), and from that moment
 * the row owns real work — a failure there records a `failureReason` for the
 * user to retry against, and `failed` is not an active status so it never
 * reaches the dashboard rail anyway. Deleting in that case would throw away a
 * run the user can still recover.
 *
 * Best-effort throughout: the caller already has a real error to surface, and
 * anything missed here is sweepable later (lib/cron/empty-draft-sweep).
 */
export async function discardDraftProject(projectId: string, token: string): Promise<void> {
  const headers = { Authorization: `Bearer ${token}` };
  try {
    const res = await fetch(`/api/projects/${projectId}`, { headers });
    if (!res.ok) return;
    const { project } = await res.json();
    if (project?.status !== "draft") return;

    await fetch(`/api/projects/${projectId}`, { method: "DELETE", headers });
  } catch {
    // Network failure mid-cleanup — leave it for the sweep.
  }
}
