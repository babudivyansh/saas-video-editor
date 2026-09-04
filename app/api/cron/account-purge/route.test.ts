import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Regression: a blocked purge (billing-history safeguard) used to log at
// warn level, which this codebase's alerting (Sentry, via logger.error)
// never surfaces — a blocked account could sit deactivated-but-undeleted
// past its purge date indefinitely with nobody notified.

vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "secret" } }));
vi.mock("@/lib/cron-tracking", () => ({ recordCronRun: vi.fn(async () => {}) }));

const loggerError = vi.fn();
const loggerWarn = vi.fn();
vi.mock("@/lib/logger", () => ({ logger: { error: loggerError, warn: loggerWarn, info: vi.fn() } }));

let dueUsers: { id: string }[] = [{ id: "blocked-1" }];
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findMany: vi.fn(async () => dueUsers) } },
}));

const hardDeleteUserAccount = vi.fn(async (id: string) =>
  id.startsWith("blocked")
    ? { ok: false as const, reason: "Account has billing history that must be retained for financial records." }
    : { ok: true as const },
);
vi.mock("@/lib/account-deletion", () => ({
  hardDeleteUserAccount: (...a: unknown[]) => (hardDeleteUserAccount as unknown as (...x: unknown[]) => unknown)(...a),
}));

const { GET } = await import("./route");

function req(): NextRequest {
  return new NextRequest("http://localhost/api/cron/account-purge", {
    headers: { authorization: "Bearer secret" },
  });
}

beforeEach(() => {
  dueUsers = [{ id: "blocked-1" }];
  vi.clearAllMocks();
});

describe("GET /api/cron/account-purge", () => {
  it("logs a blocked purge at error level (not warn) so it reaches Sentry", async () => {
    const res = await GET(req());
    const json = await res.json();
    expect(json.blocked).toBe(1);
    expect(loggerWarn).not.toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledWith(
      "cron/account-purge",
      expect.stringContaining("purge blocked for blocked-1"),
      expect.objectContaining({ reason: expect.any(String) }),
    );
  });

  it("emits one aggregate error summary when accounts are blocked", async () => {
    dueUsers = [{ id: "blocked-1" }, { id: "blocked-2" }];
    await GET(req());
    expect(loggerError).toHaveBeenCalledWith(
      "cron/account-purge",
      expect.stringContaining("2 account(s)"),
      expect.objectContaining({ userIds: ["blocked-1", "blocked-2"] }),
    );
  });

  it("does not emit the aggregate summary when nothing is blocked", async () => {
    dueUsers = [{ id: "ok-1" }];
    await GET(req());
    expect(loggerError).not.toHaveBeenCalled();
  });
});
