import { describe, expect, it } from "vitest";
import { quotaAlertDue } from "@/lib/admin/elevenlabs-quota";

const q = (used: number, period = "p1") => ({ used, limit: 30_000, canExtend: false, period });

describe("quotaAlertDue", () => {
  it("stays quiet under 80%", () => {
    expect(quotaAlertDue(q(23_999), null)).toBeNull();
  });
  it("fires at 80%, then at 95%, once each per period", () => {
    expect(quotaAlertDue(q(24_000), null)).toBe(0.8);
    expect(quotaAlertDue(q(25_000), { period: "p1", level: 0.8 })).toBeNull();
    expect(quotaAlertDue(q(28_500), { period: "p1", level: 0.8 })).toBe(0.95);
    expect(quotaAlertDue(q(29_900), { period: "p1", level: 0.95 })).toBeNull();
  });
  it("jumps straight to 95% when a day burns through both", () => {
    expect(quotaAlertDue(q(29_000), null)).toBe(0.95);
  });
  it("re-arms in a new period", () => {
    expect(quotaAlertDue(q(24_000, "p2"), { period: "p1", level: 0.95 })).toBe(0.8);
  });
  it("ignores an unknown limit", () => {
    expect(quotaAlertDue({ used: 5, limit: 0, canExtend: false, period: "p1" }, null)).toBeNull();
  });
});
