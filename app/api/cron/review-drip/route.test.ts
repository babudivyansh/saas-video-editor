import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

process.env.CRON_SECRET = "test-secret";

let stage1Rows: Array<{ userId: string }>;
let stage2Rows: Array<{ userId: string }>;
let stage3Rows: Array<{ userId: string }>;
let existingReview: { id: string } | null;
let users: Record<string, { email: string; firstName: string | null; name: string | null }>;

const findMany = vi.fn(async (args: { where: Record<string, unknown> }) => {
  if ("email1SentAt" in args.where && args.where.email1SentAt === null) return stage1Rows;
  if ("email2SentAt" in args.where && args.where.email2SentAt === null) return stage2Rows;
  return stage3Rows;
});
const updateMany = vi.fn(async () => ({}));
const update = vi.fn(async () => ({}));
const reviewFindUnique = vi.fn(async () => existingReview);
const userFindUnique = vi.fn(async (args: { where: { id: string } }) => users[args.where.id] ?? null);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    reviewEmailSequence: {
      findMany: (...args: [{ where: Record<string, unknown> }]) => findMany(...args),
      updateMany: (...args: unknown[]) => updateMany(...args),
      update: (...args: unknown[]) => update(...args),
    },
    review: { findUnique: (...args: unknown[]) => reviewFindUnique(...args) },
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
  },
}));

const getReviewSettings = vi.fn();
vi.mock("@/lib/reviews/settings", () => ({
  getReviewSettings: (...args: unknown[]) => getReviewSettings(...args),
}));

const shouldSendCategory = vi.fn();
vi.mock("@/lib/notifications", () => ({
  shouldSendCategory: (...args: unknown[]) => shouldSendCategory(...args),
}));

const sendReviewDripEmail1 = vi.fn(async () => {});
const sendReviewDripEmail2 = vi.fn(async () => {});
const sendReviewDripEmail3 = vi.fn(async () => {});
vi.mock("@/lib/email", () => ({
  sendReviewDripEmail1: (...args: unknown[]) => sendReviewDripEmail1(...args),
  sendReviewDripEmail2: (...args: unknown[]) => sendReviewDripEmail2(...args),
  sendReviewDripEmail3: (...args: unknown[]) => sendReviewDripEmail3(...args),
}));

const { GET } = await import("./route");

function get(token?: string) {
  return GET(new NextRequest("http://localhost/api/cron/review-drip", { headers: token ? { Authorization: `Bearer ${token}` } : undefined }));
}

beforeEach(() => {
  vi.clearAllMocks();
  stage1Rows = [];
  stage2Rows = [];
  stage3Rows = [];
  existingReview = null;
  users = { u1: { email: "u1@test.com", firstName: "U", name: null } };
  getReviewSettings.mockResolvedValue({ emailDrip1DelayHours: 24, emailDrip2DelayDays: 6, emailDrip3DelayDays: 12 });
  shouldSendCategory.mockResolvedValue(true);
});

describe("GET /api/cron/review-drip", () => {
  it("401s without the correct bearer secret", async () => {
    const res = await get("wrong-secret");
    expect(res.status).toBe(401);
  });

  it("sends email 1 to a due candidate and stamps email1SentAt", async () => {
    stage1Rows = [{ userId: "u1" }];
    const res = await get("test-secret");
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.sent).toBe(1);
    expect(sendReviewDripEmail1).toHaveBeenCalledWith("u1@test.com", "U", "u1", expect.any(String));
    expect(update).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { email1SentAt: expect.any(Date) } });
  });

  it("sends email 2 to a due candidate and stamps email2SentAt", async () => {
    stage2Rows = [{ userId: "u1" }];
    await get("test-secret");
    expect(sendReviewDripEmail2).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { email2SentAt: expect.any(Date) } });
  });

  it("sends email 3 to a due candidate and stamps email3SentAt", async () => {
    stage3Rows = [{ userId: "u1" }];
    await get("test-secret");
    expect(sendReviewDripEmail3).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { email3SentAt: expect.any(Date) } });
  });

  it("cancels the sequence and skips sending when a review already exists", async () => {
    stage1Rows = [{ userId: "u1" }];
    existingReview = { id: "rev-1" };
    const res = await get("test-secret");
    const data = await res.json();
    expect(data.cancelled).toBe(1);
    expect(data.sent).toBe(0);
    expect(sendReviewDripEmail1).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", cancelledAt: null }, data: expect.objectContaining({ cancelReason: "reviewed" }) }),
    );
  });

  it("cancels the sequence and skips sending when the user opted out", async () => {
    stage1Rows = [{ userId: "u1" }];
    shouldSendCategory.mockResolvedValue(false);
    const res = await get("test-secret");
    const data = await res.json();
    expect(data.cancelled).toBe(1);
    expect(sendReviewDripEmail1).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", cancelledAt: null }, data: expect.objectContaining({ cancelReason: "opted_out" }) }),
    );
  });

  it("counts a per-user send failure as an error without aborting the run", async () => {
    stage1Rows = [{ userId: "u1" }, { userId: "u2" }];
    users.u2 = { email: "u2@test.com", firstName: "V", name: null };
    sendReviewDripEmail1.mockRejectedValueOnce(new Error("smtp down"));
    const res = await get("test-secret");
    const data = await res.json();
    expect(data.errors).toBe(1);
    expect(data.sent).toBe(1);
  });
});
