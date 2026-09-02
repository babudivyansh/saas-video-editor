// The admin "Sub Ends At" input submits a date-only `YYYY-MM-DD`, and the
// schema used a bare `z.coerce.date()` — which parses that as midnight **UTC**.
//
// In IST (UTC+5:30) that is 05:30 the same morning, so an admin setting today's
// date created a subscription that had already expired before they finished
// clicking, and the user's dashboard showed Free immediately. A date-only value
// means "through the end of that day".

import { describe, expect, it, vi } from "vitest";

// schemas.ts imports KNOWN_RENDER_QUEUE_NAMES from lib/render-queue, which
// pulls in lib/redis -> lib/env and its eager strict parse. Only the queue-name
// constant is needed here.
vi.mock("@/lib/render-queue", () => ({
  KNOWN_RENDER_QUEUE_NAMES: ["auto-clip-pick", "auto-clip-render"] as const,
}));

const { userPatchSchema } = await import("./schemas");

function parseEndsAt(value: unknown): Date | null | undefined {
  const result = userPatchSchema.safeParse({
    subscriptionEndsAt: value,
    // planId is absent, so the reason refinement doesn't apply.
  });
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? "parse failed");
  return result.data.subscriptionEndsAt;
}

describe("userPatchSchema.subscriptionEndsAt", () => {
  it("puts a date-only value at the END of that day, not midnight UTC", () => {
    const parsed = parseEndsAt("2026-10-03") as Date;
    expect(parsed.toISOString()).toBe("2026-10-03T23:59:59.999Z");
  });

  // The actual regression: "today" must not already be in the past.
  it("keeps today's date in the future for every real timezone", () => {
    const today = new Date();
    const yyyy = today.getUTCFullYear();
    const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(today.getUTCDate()).padStart(2, "0");

    const parsed = parseEndsAt(`${yyyy}-${mm}-${dd}`) as Date;

    expect(parsed.getTime()).toBeGreaterThan(Date.now());
    // Midnight UTC — the old behaviour — would already have passed.
    expect(parsed.toISOString()).not.toContain("T00:00:00");
  });

  it("passes a full timestamp through untouched", () => {
    const iso = "2026-10-03T08:15:00.000Z";
    expect((parseEndsAt(iso) as Date).toISOString()).toBe(iso);
  });

  it("accepts a Date instance unchanged", () => {
    const d = new Date("2026-11-01T10:00:00.000Z");
    expect((parseEndsAt(d) as Date).toISOString()).toBe(d.toISOString());
  });

  it("still allows an explicit null — clearing the term is a real action", () => {
    expect(parseEndsAt(null)).toBeNull();
  });

  it("rejects an unparseable string instead of silently producing Invalid Date", () => {
    expect(() => parseEndsAt("not a date")).toThrow();
  });
});

describe("userPatchSchema — plan change guards", () => {
  it("requires a reason when changing a plan", () => {
    const missing = userPatchSchema.safeParse({ planId: "plan_creator" });
    expect(missing.success).toBe(false);

    const withReason = userPatchSchema.safeParse({ planId: "plan_creator", reason: "manual upgrade" });
    expect(withReason.success).toBe(true);
  });

  it("requires explicit confirmation before granting ADMIN", () => {
    expect(userPatchSchema.safeParse({ role: "ADMIN" }).success).toBe(false);
    expect(userPatchSchema.safeParse({ role: "ADMIN", confirm: true }).success).toBe(true);
    // Demoting is reversible and needs no confirmation.
    expect(userPatchSchema.safeParse({ role: "USER" }).success).toBe(true);
  });

  it("rejects an empty patch", () => {
    expect(userPatchSchema.safeParse({}).success).toBe(false);
  });
});
