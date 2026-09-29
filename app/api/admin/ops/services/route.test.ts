import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin/api", () => ({
  withAdmin: (handler: (req: NextRequest, ctx: { admin: { userId: string } }) => Promise<Response>) =>
    (req: NextRequest) => handler(req, { admin: { userId: "admin1" } }),
}));
// Every secret is a sentinel so a leak anywhere in the response is detectable.
const SECRET = "SENTINEL-SECRET-9f3a";
const env: Record<string, string | undefined> = {
  DATABASE_URL: `postgres://u:${SECRET}@db/x`,
  REDIS_URL: `redis://:${SECRET}@r:6379`,
  AWS_ACCESS_KEY_ID: SECRET, AWS_SECRET_ACCESS_KEY: SECRET, AWS_S3_BUCKET: "bucket", AWS_REGION: "ap-south-1",
  RAZORPAY_KEY_ID: `rzp_test_${SECRET}`, RAZORPAY_KEY_SECRET: SECRET,
  RESEND_API_KEY: SECRET, ELEVENLABS_API_KEY: SECRET, OPENAI_API_KEY: SECRET, GEMINI_API_KEY: SECRET,
  FAL_KEY: SECRET, SUBMAGIC_API_KEY: SECRET, SCRAPECREATORS_API_KEY: SECRET,
};
vi.mock("@/lib/env", () => ({ env }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true })) }));
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: vi.fn(async () => [1]) } }));
vi.mock("@/lib/redis", () => ({ redis: { ping: vi.fn(async () => true) } }));
vi.mock("@/utils/s3-upload", () => ({ s3: { send: vi.fn(async () => { throw Object.assign(new Error(`denied for ${SECRET}`), { name: "AccessDenied" }); }) } }));
vi.mock("@/lib/gpu-service", () => ({ gpuHealth: vi.fn(async () => ({ configured: false, reachable: false, breakerOpen: false })) }));
vi.mock("@/lib/captions/CaptionRendererFactory", () => ({
  captionProviderHealth: vi.fn(async () => ({ submagic: { configured: true, reachable: true, breakerOpen: false } })),
}));

const { GET } = await import("./route");
const get = (q = "") => GET(new NextRequest(`http://x/api/admin/ops/services${q}`));

beforeEach(() => {
  // A provider that rejects the key AND echoes it back in the body.
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("elevenlabs")) {
      return new Response(JSON.stringify({ subscription: { tier: "free", character_count: 2500, character_limit: 10000 } }), { status: 200 });
    }
    return new Response(`invalid key ${SECRET}`, { status: 401 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("GET /api/admin/ops/services", () => {
  it("lists configured state without calling any provider", async () => {
    const body = await (await get()).json();
    expect(fetch).not.toHaveBeenCalled();
    const byId = Object.fromEntries(body.services.map((s: { id: string }) => [s.id, s]));
    expect(byId.razorpay.configured).toBe(true);
    expect(byId.pexels.configured).toBe(false);
    expect(byId.fal.ok).toBeNull();
  });

  it("never returns a secret — not from env, a provider's error body, or an SDK error message", async () => {
    const res = await get("?id=all");
    const text = await res.text();
    expect(text).not.toContain(SECRET);
    const byId = Object.fromEntries(JSON.parse(text).services.map((s: { id: string }) => [s.id, s]));
    expect(byId.razorpay).toMatchObject({ ok: false, detail: "key rejected (HTTP 401)" });
    expect(byId.s3).toMatchObject({ ok: false, detail: "failed: AccessDenied" });
    expect(byId.database.ok).toBe(true);
  });

  it("reports usage where the provider exposes it", async () => {
    const body = await (await get("?id=elevenlabs")).json();
    expect(body.services[0]).toMatchObject({ ok: true, usage: { used: 2500, limit: 10000, unit: "characters" } });
  });

  it("never probes a billable-only provider", async () => {
    const body = await (await get("?id=fal")).json();
    expect(fetch).not.toHaveBeenCalled();
    expect(body.services[0].ok).toBeNull();
  });

  it("404s an unknown service id", async () => {
    expect((await get("?id=nope")).status).toBe(404);
  });
});
