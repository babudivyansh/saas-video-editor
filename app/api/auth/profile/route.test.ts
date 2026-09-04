import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Ownership regression coverage for the Global Asset Library avatar path:
// PATCH /api/auth/profile { avatarAssetId } must resolve to the asset's
// PERMANENT public URL (never the picker's short-lived signed read URL —
// that would leave the avatar broken a few hours later) and must refuse an
// asset id that doesn't belong to the caller, rather than trusting it.

let authUser: { userId: string } | null = { userId: "u1" };
vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => authUser),
}));

// PATCH is now rate-limited (withRateLimit); always allow so these
// ownership/behavior tests aren't coupled to the rate-limit window.
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true, remaining: 1 })),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

const ASSET_OWNED = { id: "asset-owned", s3Key: "uploads/u1/avatar.png" };
const findFirstImpl = vi.fn(async ({ where }: { where: { id: string; userId: string } }) => {
  // Mirrors real Prisma semantics: userId is part of the WHERE clause, so an
  // asset belonging to someone else simply doesn't match — never returned
  // and never leaked via a separate ownership check the caller could forget.
  if (where.id === ASSET_OWNED.id && where.userId === "u1") return ASSET_OWNED;
  return null;
});
const userUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
  id: "u1", email: "u1@example.com", phone: null, name: "U1",
  avatarUrl: data.avatarUrl ?? null, gender: null, intendedUse: null, preferredLanguage: "en",
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: { findFirst: (...a: unknown[]) => (findFirstImpl as unknown as (...x: unknown[]) => unknown)(...a) },
    user: { update: (...a: unknown[]) => (userUpdate as unknown as (...x: unknown[]) => unknown)(...a) },
  },
}));

vi.mock("@/lib/account-deletion", () => ({ hardDeleteUserAccount: vi.fn() }));
vi.mock("@/lib/i18n-locales", () => ({ LOCALE_COOKIE: "locale", isSupportedLocale: () => true }));
vi.mock("@/lib/quests", () => ({ markQuestComplete: vi.fn() }));
vi.mock("@/utils/s3-upload", () => ({
  s3KeyToPublicUrl: (key: string) => `https://bucket.example.s3.amazonaws.com/${key}`,
}));

const { PATCH } = await import("./route");

function patchRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/auth/profile", { method: "PATCH", body: JSON.stringify(body) });
}

beforeEach(() => {
  authUser = { userId: "u1" };
  vi.clearAllMocks();
});

describe("PATCH /api/auth/profile — avatarAssetId", () => {
  it("resolves an owned asset to its permanent public URL, not a signed one", async () => {
    const res = await PATCH(patchRequest({ avatarAssetId: ASSET_OWNED.id }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.user.avatarUrl).toBe("https://bucket.example.s3.amazonaws.com/uploads/u1/avatar.png");
    expect(userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ avatarUrl: "https://bucket.example.s3.amazonaws.com/uploads/u1/avatar.png" }),
    }));
  });

  it("returns 404 for an asset id that belongs to another user — never trusts the client-supplied id", async () => {
    const res = await PATCH(patchRequest({ avatarAssetId: "someone-elses-asset" }));
    expect(res.status).toBe(404);
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("falls back to the legacy raw avatarUrl field when no avatarAssetId is given", async () => {
    const res = await PATCH(patchRequest({ avatarUrl: "https://bucket.example.s3.amazonaws.com/uploads/u1/legacy.png" }));
    expect(res.status).toBe(200);
    expect(findFirstImpl).not.toHaveBeenCalled();
    expect(userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ avatarUrl: "https://bucket.example.s3.amazonaws.com/uploads/u1/legacy.png" }),
    }));
  });
});
