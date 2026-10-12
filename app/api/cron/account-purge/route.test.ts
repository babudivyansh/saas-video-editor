import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Accounts with billing history used to be "blocked" here forever — logged for
// staff, never deleted. They are now purged by anonymisation and count as
// purged; only a genuine failure is reported, at error level so it reaches
// Sentry (logger.warn never does).

vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "secret" } }));
vi.mock("@/lib/cron-tracking", () => ({ recordCronRun: vi.fn(async () => {}), withCronTracking: (_n: string, h: unknown) => h }));

const loggerError = vi.fn();
const loggerWarn = vi.fn();
vi.mock("@/lib/logger", () => ({ logger: { error: loggerError, warn: loggerWarn, info: vi.fn() } }));

let dueUsers: { id: string }[] = [];
const findMany = vi.fn(async () => dueUsers);
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findMany: (...a: unknown[]) => (findMany as unknown as (...x: unknown[]) => unknown)(...a) } },
}));

const hardDeleteUserAccount = vi.fn(async (id: string) => {
  if (id.startsWith("throws")) throw new Error("db down");
  return id.startsWith("paying")
    ? { ok: true as const, mode: "anonymised" as const }
    : { ok: true as const, mode: "deleted" as const };
});
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
  dueUsers = [];
  vi.clearAllMocks();
});

describe("GET /api/cron/account-purge", () => {
  it("counts an account with billing history as purged, not blocked", async () => {
    dueUsers = [{ id: "paying-1" }, { id: "free-1" }];
    const json = await (await GET(req())).json();
    expect(json).toMatchObject({ purged: 2, anonymised: 1, failed: 0, checked: 2 });
    expect(json.blocked).toBeUndefined();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it("never re-selects an already-purged tombstone", async () => {
    await GET(req());
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ purgedAt: null }) }));
  });

  it("reports a failed purge at error level with one aggregate summary", async () => {
    dueUsers = [{ id: "throws-1" }, { id: "free-1" }];
    const json = await (await GET(req())).json();
    expect(json).toMatchObject({ purged: 1, failed: 1 });
    expect(loggerWarn).not.toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledWith(
      "cron/account-purge",
      expect.stringContaining("1 account(s)"),
      expect.objectContaining({ userIds: ["throws-1"] }),
    );
  });
});
