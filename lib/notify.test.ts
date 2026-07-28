import { beforeEach, describe, expect, it, vi } from "vitest";

const notificationCreate = vi.fn();
const notificationCreateMany = vi.fn();
let admins: { id: string }[];
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: {
      create: (...args: unknown[]) => notificationCreate(...args),
      createMany: (...args: unknown[]) => notificationCreateMany(...args),
    },
    user: {
      findMany: vi.fn(async () => admins),
    },
  },
}));

const { notify, notifyMany, notifyAdmins } = await import("./notify");

beforeEach(() => {
  vi.clearAllMocks();
  admins = [{ id: "admin-1" }, { id: "admin-2" }];
  notificationCreate.mockResolvedValue({});
  notificationCreateMany.mockResolvedValue({});
});

describe("notify", () => {
  it("writes a notification row", async () => {
    await notify({ userId: "u1", type: "review_published", title: "Your review is live" });
    expect(notificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u1", type: "review_published", title: "Your review is live" }) }),
    );
  });

  it("never throws when the write fails", async () => {
    notificationCreate.mockRejectedValue(new Error("db down"));
    await expect(notify({ userId: "u1", type: "review_published", title: "x" })).resolves.toBeUndefined();
  });
});

describe("notifyMany", () => {
  it("no-ops on an empty array without calling createMany", async () => {
    await notifyMany([]);
    expect(notificationCreateMany).not.toHaveBeenCalled();
  });

  it("bulk-inserts multiple notifications", async () => {
    await notifyMany([
      { userId: "u1", type: "review_reply", title: "a" },
      { userId: "u2", type: "review_reply", title: "b" },
    ]);
    expect(notificationCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ userId: "u1" }), expect.objectContaining({ userId: "u2" })]) }),
    );
  });

  it("never throws on a bulk write failure", async () => {
    notificationCreateMany.mockRejectedValue(new Error("db down"));
    await expect(notifyMany([{ userId: "u1", type: "review_reply", title: "a" }])).resolves.toBeUndefined();
  });
});

describe("notifyAdmins", () => {
  it("fans out to every admin user", async () => {
    await notifyAdmins("admin_review_new", "New review submitted");
    expect(notificationCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: "admin-1", type: "admin_review_new" }),
          expect.objectContaining({ userId: "admin-2", type: "admin_review_new" }),
        ]),
      }),
    );
  });

  it("no-ops when there are no admins", async () => {
    admins = [];
    await notifyAdmins("admin_review_new", "New review submitted");
    expect(notificationCreateMany).not.toHaveBeenCalled();
  });
});
