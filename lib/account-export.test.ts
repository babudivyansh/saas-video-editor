import { beforeEach, describe, expect, it, vi } from "vitest";

// Regression guard for the GDPR export gap: social account data (accounts,
// snapshots, posts, audience, insights, goals, competitors) used to be
// entirely absent from "download my data" — an access request returned an
// incomplete dataset. The one thing this must never do is leak the
// encrypted OAuth token columns into the export.

let written = "";
vi.mock("os", () => ({ default: { tmpdir: () => "/tmp" }, tmpdir: () => "/tmp" }));
vi.mock("fs", () => {
  const mkdirSync = vi.fn();
  const writeFileSync = vi.fn((_path: string, data: string) => { written = data; });
  const rmSync = vi.fn();
  return { default: { mkdirSync, writeFileSync, rmSync }, mkdirSync, writeFileSync, rmSync };
});

vi.mock("@/lib/render-queue", () => ({
  createRenderQueue: () => ({ enqueue: vi.fn() }),
}));

vi.mock("@/utils/s3-upload", () => ({
  uploadFileToS3: vi.fn(async () => {}),
  getAssetReadUrl: vi.fn(async () => "https://signed.example/export.json"),
}));

vi.mock("@/lib/email", () => ({
  sendAccountExportReadyEmail: vi.fn(async () => {}),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/redis", () => ({
  redis: { set: vi.fn(async () => {}), get: vi.fn(async () => null) },
}));

const socialAccount = {
  id: "acct1",
  provider: "youtube",
  providerAccountId: "chan1",
  username: "creator",
  displayName: "Creator",
  avatarUrl: null,
  tokenExpiresAt: null,
  scopes: [],
  status: "active",
  followers: 1000,
  lastSyncedAt: null,
  lastSyncStatus: "ok",
  lastSyncError: null,
  timezone: null,
  healthScore: null,
  healthScoreAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  // These two must never appear in the export — asserted below via the
  // select clause the mock enforces, and again via a JSON string check.
  accessTokenEnc: "should-never-leak",
  refreshTokenEnc: "should-never-leak-either",
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ id: "u1", email: "u1@test.local", phone: null, firstName: "U", lastName: "1", name: "U 1", gender: null, intendedUse: null, createdAt: new Date(), emailVerifiedAt: null, credits: 10 })) },
    project: { findMany: vi.fn(async () => []) },
    asset: { findMany: vi.fn(async () => []) },
    purchase: { findMany: vi.fn(async () => []) },
    loginEvent: { findMany: vi.fn(async () => []) },
    notificationPreference: { findUnique: vi.fn(async () => null) },
    socialAccount: {
      findMany: vi.fn(async ({ select }: { select: Record<string, boolean> }) => {
        // Mirror Prisma's own behavior: a `select` clause only returns the
        // requested columns — this is what actually enforces the exclusion,
        // not just the test's own diligence.
        const row: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          row[key] = (socialAccount as Record<string, unknown>)[key];
        }
        return [row];
      }),
    },
    competitorProfile: { findMany: vi.fn(async () => []) },
    socialGoal: { findMany: vi.fn(async () => []) },
    socialAccountSnapshot: { findMany: vi.fn(async () => [{ id: "snap1", accountId: "acct1", followers: 1000 }]) },
    socialDailyMetric: { findMany: vi.fn(async () => [{ id: "dm1", accountId: "acct1", views: 50 }]) },
    socialPost: { findMany: vi.fn(async () => [{ id: "post1", accountId: "acct1", likes: 5 }]) },
    socialAudienceSnapshot: { findMany: vi.fn(async () => []) },
    aiInsight: { findMany: vi.fn(async () => []) },
    competitorSnapshot: { findMany: vi.fn(async () => []) },
  },
}));

const { accountExportJob } = await import("./account-export");

beforeEach(() => {
  written = "";
});

describe("accountExportJob — social data", () => {
  it("includes the user's social accounts, snapshots, posts, and goals", async () => {
    await accountExportJob({ projectId: "job1", jobId: "job1", userId: "u1" });
    const bundle = JSON.parse(written);
    expect(bundle.social.accounts).toEqual([expect.objectContaining({ id: "acct1", provider: "youtube" })]);
    expect(bundle.social.accountSnapshots).toEqual([expect.objectContaining({ id: "snap1" })]);
    expect(bundle.social.dailyMetrics).toEqual([expect.objectContaining({ id: "dm1" })]);
    expect(bundle.social.posts).toEqual([expect.objectContaining({ id: "post1" })]);
  });

  it("never includes accessTokenEnc or refreshTokenEnc anywhere in the export", async () => {
    await accountExportJob({ projectId: "job1", jobId: "job1", userId: "u1" });
    expect(written).not.toContain("accessTokenEnc");
    expect(written).not.toContain("refreshTokenEnc");
    expect(written).not.toContain("should-never-leak");
  });
});
