// What a failed tool job may show its user (2026-10-14 tools audit).
//
// Tool routes copied `err.message` straight into `job.error`, which the poll
// endpoint returns to the browser — and those messages carried FFmpeg's whole
// banner and build configuration, absolute server temp paths, fal.ai response
// bodies and yt-dlp stderr, on routes anonymous callers can reach. Now only an
// error thrown as UserFacingError is shown as-is; anything else becomes the
// route's fixed fallback, and the raw text goes to the logs and the
// Generation row (rawErrorText) where admins can still read it.

/** An error whose message was written for the end user and is safe to show. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

/** The message to show the user: the error's own only if it was written for them. */
export function userMessage(err: unknown, fallback: string): string {
  return err instanceof UserFacingError ? err.message : fallback;
}

/** The full internal text, for logs and the Generation row — never the client. */
export function rawErrorText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 2000);
}
