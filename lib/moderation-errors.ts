// Shared by the asset and review-attachment moderation jobs. Its own module so
// neither job imports the other (each builds a queue at import time).

/** A short, storable reason for a failed scan: the AWS error name and message. */
export function scanErrorReason(e: unknown): string {
  const err = e as { name?: string; message?: string } | null;
  return `${err?.name ?? "Error"}: ${err?.message ?? String(e)}`.slice(0, 300);
}
