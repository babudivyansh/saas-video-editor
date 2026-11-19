import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Admin-only toggle for per-feature maintenance: non-admins are refused, a
// toggle persists and is audited, unknown features are rejected.

let role: "admin" | "user" = "admin";
vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => (role === "admin" ? { userId: "admin1", email: "a@x.co", sessionId: "s1" } : null)),
  getAuthUser: vi.fn(async () => ({ userId: "admin1" })),
}));
vi.mock("@/lib/admin/elevation", () => ({ isElevated: vi.fn(async () => true) }));
const audit = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@/lib/admin/audit", () => ({
  auditAdminAction: (...args: unknown[]) => audit(...args),
  auditOnce: vi.fn(async () => false),
  auditIp: () => "1.2.3.4",
}));
vi.mock("@/lib/rate-limit", () => ({ getClientIp: () => "1.2.3.4" }));
const map: Record<string, { since: string; by?: string }> = {};
vi.mock("@/lib/feature-maintenance", () => ({
  getFeatureMaintenance: vi.fn(async () => ({ ...map })),
  setFeatureMaintenance: vi.fn(async (id: string, on: boolean, by?: string) => {
    if (on) map[id] = { since: "2026-11-20T00:00:00.000Z", by };
    else delete map[id];
    return { ...map };
  }),
}));

const { GET, PATCH } = await import("./route");
type Handler = (req: NextRequest) => Promise<Response>;
type Row = { id: string; on: boolean; label: string };

const patch = (body: unknown) =>
  (PATCH as unknown as Handler)(
    new NextRequest("http://localhost/api/admin/ops/feature-maintenance", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const get = () => (GET as unknown as Handler)(new NextRequest("http://localhost/api/admin/ops/feature-maintenance"));

beforeEach(() => {
  role = "admin";
  audit.mockClear();
  for (const k of Object.keys(map)) delete map[k];
});

describe("/api/admin/ops/feature-maintenance", () => {
  it("is admin-only", async () => {
    role = "user";
    expect((await get()).status).toBe(403);
    expect((await patch({ feature: "auto-clip", on: true })).status).toBe(403);
    expect(map).toEqual({});
    expect(audit).not.toHaveBeenCalled();
  });

  it("lists every feature with its state", async () => {
    map["auto-clip"] = { since: "2026-11-20T00:00:00.000Z" };
    const body = (await (await get()).json()) as { features: Row[] };
    expect(body.features.map((f) => f.id)).toEqual(
      expect.arrayContaining(["auto-clip", "video-editor", "caption-studio", "social-tracker", "ai-voiceover", "youtube-downloader", "ai-photo-editor"]),
    );
    expect(body.features.find((f) => f.id === "auto-clip")).toMatchObject({ on: true, label: "Clipiro AutoClip" });
    expect(body.features.find((f) => f.id === "video-editor")).toMatchObject({ on: false });
  });

  it("switches a feature on and off, auditing each change", async () => {
    const on = await patch({ feature: "ai-voiceover", on: true });
    expect(on.status).toBe(200);
    expect(((await on.json()) as { features: Row[] }).features.find((f) => f.id === "ai-voiceover")?.on).toBe(true);
    expect(audit).toHaveBeenLastCalledWith(
      "admin1", "feature_maintenance.enabled", "ai-voiceover",
      expect.objectContaining({ before: { on: false }, after: { on: true } }),
    );

    await patch({ feature: "ai-voiceover", on: false });
    expect(audit).toHaveBeenLastCalledWith(
      "admin1", "feature_maintenance.disabled", "ai-voiceover",
      expect.objectContaining({ before: { on: true }, after: { on: false } }),
    );
  });

  it("does not audit a no-op", async () => {
    await patch({ feature: "auto-clip", on: false });
    expect(audit).not.toHaveBeenCalled();
  });

  it("rejects an unknown feature or a malformed body", async () => {
    expect((await patch({ feature: "video-generator", on: true })).status).toBe(400);
    expect((await patch({ feature: "auto-clip" })).status).toBe(400);
    expect(audit).not.toHaveBeenCalled();
  });
});
