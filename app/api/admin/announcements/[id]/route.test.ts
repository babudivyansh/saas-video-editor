import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Guards the race this route exists to prevent: once published, content must
// be immutable (so an in-flight edit can never land between the cron reading
// the row and it building the email); once sent, the row is frozen entirely.

vi.mock("@/lib/auth", () => ({ requireAdmin: vi.fn(async () => ({ userId: "admin-1" })) }));
vi.mock("@/lib/admin/elevation", () => ({ isElevated: vi.fn(async () => true) }));
vi.mock("@/lib/admin/audit", () => ({ auditAdminAction: vi.fn(async () => {}), auditIp: vi.fn(() => "127.0.0.1") }));

let existing: {
  id: string; title: string; body: string; ctaLabel: string | null; ctaUrl: string | null;
  audience: string; publishedAt: Date | null; sentAt: Date | null;
} | null;
const updateMock = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...existing, ...data }));
const deleteMock = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    featureAnnouncement: {
      findUnique: vi.fn(async () => existing),
      update: (...a: unknown[]) => (updateMock as unknown as (...x: unknown[]) => unknown)(...a),
      delete: (...a: unknown[]) => (deleteMock as unknown as (...x: unknown[]) => unknown)(...a),
    },
  },
}));

const { PATCH, DELETE } = await import("./route");

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}
function patchReq(body: unknown) {
  return new NextRequest("http://localhost/api/admin/announcements/a1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  existing = {
    id: "a1", title: "T", body: "B", ctaLabel: null, ctaUrl: null,
    audience: "featureReleases", publishedAt: null, sentAt: null,
  };
  vi.clearAllMocks();
});

describe("PATCH /api/admin/announcements/[id]", () => {
  it("edits content on a draft", async () => {
    const res = await PATCH(patchReq({ title: "New title" }), ctx("a1"));
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({ where: { id: "a1" }, data: { title: "New title" } });
  });

  it("publishing a draft sets publishedAt", async () => {
    const res = await PATCH(patchReq({ publish: true }), ctx("a1"));
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({ where: { id: "a1" }, data: { publishedAt: expect.any(Date) } });
  });

  it("re-publishing an already-published draft is a no-op on publishedAt (idempotent)", async () => {
    existing!.publishedAt = new Date("2026-01-01T00:00:00Z");
    const res = await PATCH(patchReq({ publish: true }), ctx("a1"));
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({ where: { id: "a1" }, data: {} });
  });

  it("refuses a content edit once published — the exact race this route exists to prevent", async () => {
    existing!.publishedAt = new Date("2026-01-01T00:00:00Z");
    const res = await PATCH(patchReq({ title: "Sneaky edit" }), ctx("a1"));
    expect(res.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("refuses any edit at all once sent", async () => {
    existing!.publishedAt = new Date("2026-01-01T00:00:00Z");
    existing!.sentAt = new Date("2026-01-02T00:00:00Z");
    const res = await PATCH(patchReq({ publish: true }), ctx("a1"));
    expect(res.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("404s for an id that doesn't exist", async () => {
    existing = null;
    const res = await PATCH(patchReq({ title: "x" }), ctx("missing"));
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/admin/announcements/[id]", () => {
  it("allows deleting a published-but-unsent announcement (cancel before the cron runs)", async () => {
    existing!.publishedAt = new Date("2026-01-01T00:00:00Z");
    const res = await DELETE(new NextRequest("http://localhost/api/admin/announcements/a1", { method: "DELETE" }), ctx("a1"));
    expect(res.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: "a1" } });
  });

  it("refuses to delete once sent", async () => {
    existing!.sentAt = new Date("2026-01-02T00:00:00Z");
    const res = await DELETE(new NextRequest("http://localhost/api/admin/announcements/a1", { method: "DELETE" }), ctx("a1"));
    expect(res.status).toBe(409);
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
