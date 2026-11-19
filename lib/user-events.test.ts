import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn(async (_args: { data: Record<string, unknown> }) => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { userEvent: { create } } }));
const warn = vi.fn();
vi.mock("@/lib/logger", () => ({ logger: { warn, error: vi.fn(), info: vi.fn() } }));

const { recordDownloadEvent, recordSignupEvent } = await import("./user-events");

beforeEach(() => vi.clearAllMocks());

describe("user events", () => {
  it("records a signup once per user", async () => {
    await recordSignupEvent("u1", { method: "google" });
    expect(create).toHaveBeenCalledWith({ data: { userId: "u1", type: "signup", meta: { method: "google" }, dedupeKey: "signup:u1" } });
  });

  it("keys a download by user and file, keeping only the top folder", async () => {
    await recordDownloadEvent("u1", "clips/u1/abc/clip-1.mp4", "clip-1.mp4");
    await recordDownloadEvent("u1", "clips/u1/abc/clip-1.mp4", "clip-1.mp4");
    const [a, b] = create.mock.calls.map((c) => c[0].data);
    expect(a.meta).toEqual({ name: "clip-1.mp4", area: "clips" });
    expect(a.dedupeKey).toBe(b.dedupeKey);
    expect(a.dedupeKey).toMatch(/^download:u1:[0-9a-f]{24}$/);
  });

  it("treats a duplicate as expected and anything else as a logged warning, never a throw", async () => {
    create.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));
    await expect(recordSignupEvent("u1", { method: "email" })).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();

    create.mockRejectedValueOnce(new Error("db down"));
    await expect(recordSignupEvent("u1", { method: "email" })).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("user-events", expect.stringContaining("signup"), expect.anything());
  });
});
