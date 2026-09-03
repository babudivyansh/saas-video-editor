// Deciding which fields an admin's inline edit should actually PATCH.
//
// Extracted from the page so the rule is testable on its own — it caused a
// production bug that was invisible from both ends. The old version diffed the
// edit buffer against the row:
//
//     if (editSubEnd !== (u.subscriptionEndsAt ?? "")) body.subscriptionEndsAt = editSubEnd || null;
//
// which is only correct while the row can't change underneath the editor. It
// can: applying a plan refetches the list, so `u.subscriptionEndsAt` became a
// future date while the buffer still held the pre-change value. Saving then
// looked like an edit and sent `subscriptionEndsAt: null`, wiping the term the
// plan had just set and leaving `planId` in place — the exact state where the
// admin panel shows a plan and the user's dashboard shows Free.
//
// The fix is to send a field only when the admin actually typed in it.

export interface EditableUserRow {
  monthlyCredits: number;
  subscriptionEndsAt: string | null;
  name: string | null;
  email: string;
}

export interface EditBuffer {
  monthlyCredits: string;
  /** `YYYY-MM-DD` from the date input, or "" for cleared. */
  subscriptionEndsAt: string;
  name: string;
  email: string;
}

export type EditableField = keyof EditBuffer;

/** The row's end date in the date input's format, for comparison. */
export function toDateInputValue(iso: string | null): string {
  return iso ? iso.split("T")[0] : "";
}

/**
 * Build the PATCH body for an inline user edit.
 *
 * `touched` is the set of fields the admin actually edited this expansion. A
 * field absent from it is never sent, no matter what the buffer holds — that
 * is the whole point. A touched field is still compared against the row, so
 * typing a value back to what it already was sends nothing.
 */
export function buildUserPatchBody(
  row: EditableUserRow,
  buffer: EditBuffer,
  touched: ReadonlySet<string>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  if (touched.has("monthlyCredits")) {
    const parsed = parseInt(buffer.monthlyCredits, 10);
    if (!Number.isNaN(parsed) && parsed !== row.monthlyCredits) {
      body.monthlyCredits = parsed;
    }
  }

  if (touched.has("subscriptionEndsAt")) {
    const current = toDateInputValue(row.subscriptionEndsAt);
    if (buffer.subscriptionEndsAt !== current) {
      // "" is a deliberate clear, and only reachable now that the admin has
      // actually emptied the field themselves.
      body.subscriptionEndsAt = buffer.subscriptionEndsAt || null;
    }
  }

  if (touched.has("name")) {
    const trimmed = buffer.name.trim();
    if (trimmed !== (row.name ?? "")) body.name = trimmed;
  }

  if (touched.has("email")) {
    const trimmed = buffer.email.trim().toLowerCase();
    if (trimmed && trimmed !== row.email) body.email = trimmed;
  }

  return body;
}
