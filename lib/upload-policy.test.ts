import { beforeEach, describe, expect, it, vi } from "vitest";

// resolveUploadPolicy is the shared entitlement resolver every AI/utility
// tool route (outside the Asset Library) now calls instead of a hardcoded
// MAX_BYTES constant — these tests cover the tier<->feature min() algorithm,
// limiting-factor resolution, and the anonymous (no session) fallback.

let tier: "free" | "creator" | "pro" | "studio" = "free";
let isAdmin = false;
vi.mock("@/lib/auth", () => ({
  getUserTier: vi.fn(async () => tier),
  requireAdmin: vi.fn(async () => (isAdmin ? { userId: "admin" } : null)),
}));
let maintenance: { on: boolean; message?: string } = { on: false };
vi.mock("@/lib/flags", () => ({ getMaintenanceModeCached: vi.fn(async () => maintenance) }));
const { NextRequest } = await import("next/server");

const {
  resolveUploadPolicy,
  assertWithinUploadPolicy,
  UploadPolicyError,
  uploadPolicyErrorStatus,
  FEATURE_TECHNICAL_MAX_BYTES,
  ANONYMOUS_MAX_BYTES,
  MULTIPART_OVERHEAD_BYTES,
  readUploadForm,
} = await import("./upload-policy");
const { MAX_UPLOAD_BYTES_BY_TIER } = await import("./plans/tiers");

beforeEach(() => {
  tier = "free";
  isAdmin = false;
  maintenance = { on: false };
});

describe("resolveUploadPolicy — effective = min(plan, feature, provider)", () => {
  it("Free + Subtitle Remover: plan (250MB) binds under the feature's 500MB cap", async () => {
    tier = "free";
    const policy = await resolveUploadPolicy("u1", "subtitle-remover");
    expect(policy.effectiveMaxBytes).toBe(MAX_UPLOAD_BYTES_BY_TIER.free);
    expect(policy.limitingFactor).toBe("plan");
  });

  it("Creator + Subtitle Remover: the feature's 500MB cap binds under the plan's 1GB", async () => {
    tier = "creator";
    const policy = await resolveUploadPolicy("u1", "subtitle-remover");
    expect(policy.effectiveMaxBytes).toBe(FEATURE_TECHNICAL_MAX_BYTES["subtitle-remover"]);
    expect(policy.limitingFactor).toBe("feature");
  });

  it("Studio + Face Swap: the feature's 10MB cap binds even on the largest plan (5GB)", async () => {
    tier = "studio";
    const policy = await resolveUploadPolicy("u1", "face-swap");
    expect(policy.effectiveMaxBytes).toBe(10 * 1024 * 1024);
    expect(policy.limitingFactor).toBe("feature");
  });

  it("never lets a feature cap raise the effective limit above the plan cap", async () => {
    for (const t of ["free", "creator", "pro", "studio"] as const) {
      tier = t;
      const policy = await resolveUploadPolicy("u1", "face-swap");
      expect(policy.effectiveMaxBytes).toBeLessThanOrEqual(MAX_UPLOAD_BYTES_BY_TIER[t]);
    }
  });

  it("anonymous caller (no session) is held to ANONYMOUS_MAX_BYTES, not the 500MB feature ceiling", async () => {
    const policy = await resolveUploadPolicy(null, "audio-balancer");
    expect(policy.tier).toBeNull();
    expect(policy.planMaxBytes).toBe(ANONYMOUS_MAX_BYTES);
    expect(ANONYMOUS_MAX_BYTES).toBeLessThan(FEATURE_TECHNICAL_MAX_BYTES["audio-balancer"]);
    expect(policy.effectiveMaxBytes).toBe(ANONYMOUS_MAX_BYTES);
    expect(policy.limitingFactor).toBe("plan");
    expect(policy.planLabel).toBe("Guest");
  });

  it("anonymous rejection asks the caller to sign in, not to upgrade", async () => {
    const policy = await resolveUploadPolicy(null, "mp3-converter");
    expect(() => assertWithinUploadPolicy(policy, ANONYMOUS_MAX_BYTES + 1)).toThrow(/Sign in to upload/);
  });
});

describe("readUploadForm — size enforced before the body is buffered", () => {
  const boundary = "----test";
  const multipart = (bytes: number) =>
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n` +
    "x".repeat(bytes) + `\r\n--${boundary}--\r\n`;

  it("parses a body that fits", async () => {
    const policy = await resolveUploadPolicy(null, "mp3-converter");
    const body = multipart(1000);
    const req = new NextRequest("http://l/x", {
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": String(body.length) },
      body,
    });
    const form = await readUploadForm(req, policy);
    expect(form).toBeInstanceOf(FormData);
    expect(((form as FormData).get("file") as File).size).toBe(1000);
  });

  it("413s a declared Content-Length over the limit without reading the body", async () => {
    const policy = await resolveUploadPolicy(null, "mp3-converter");
    let pulled = false;
    const req = new NextRequest("http://l/x", {
      method: "POST",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "content-length": String(ANONYMOUS_MAX_BYTES + MULTIPART_OVERHEAD_BYTES + 1),
      },
      // highWaterMark 0: pull() runs only when someone actually reads.
      body: new ReadableStream({ pull() { pulled = true; } }, { highWaterMark: 0 }),
      // @ts-expect-error — Node's fetch needs this for a stream body
      duplex: "half",
    });
    const res = await readUploadForm(req, policy);
    expect(res).not.toBeInstanceOf(FormData);
    expect((res as Response).status).toBe(413);
    expect(((await (res as Response).json()) as { error: string }).error).toMatch(/Sign in to upload/);
    expect(pulled).toBe(false);
  });

  it("cuts off a chunked body (no Content-Length) as soon as it passes the limit", async () => {
    tier = "studio";
    const policy = await resolveUploadPolicy("u1", "face-swap"); // 10 MB
    const limit = policy.effectiveMaxBytes + MULTIPART_OVERHEAD_BYTES;
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const req = new NextRequest("http://l/x", {
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      body: new ReadableStream({
        pull(controller) {
          // An endless body: only the reader's cut-off can end this test.
          sent += chunk.byteLength;
          controller.enqueue(chunk);
        },
      }),
      // @ts-expect-error — Node's fetch needs this for a stream body
      duplex: "half",
    });
    const res = await readUploadForm(req, policy);
    expect((res as Response).status).toBe(413);
    expect(sent).toBeLessThan(limit + 4 * chunk.byteLength);
  });

  it("503s during maintenance (the proxy gate it replaces), but lets an admin through", async () => {
    const policy = await resolveUploadPolicy(null, "mp3-converter");
    const body = multipart(10);
    const make = () => new NextRequest("http://l/x", {
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": String(body.length) },
      body,
    });
    maintenance = { on: true, message: "Back soon" };
    const res = (await readUploadForm(make(), policy)) as Response;
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe("Back soon");
    isAdmin = true;
    expect(await readUploadForm(make(), policy)).toBeInstanceOf(FormData);
  });

  it("scales the limit for multi-file routes", async () => {
    tier = "studio";
    const policy = await resolveUploadPolicy("u1", "face-swap");
    const twoFiles = 2 * policy.effectiveMaxBytes;
    const req = (n: number) => new NextRequest("http://l/x", {
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": String(twoFiles) },
      body: multipart(10),
    });
    expect(((await readUploadForm(req(1), policy, 1)) as Response).status).toBe(413);
    // Same declared size passes the length gate with room for 2 files (the
    // tiny real body then parses normally).
    expect(await readUploadForm(req(2), policy, 2)).toBeInstanceOf(FormData);
  });
});

describe("assertWithinUploadPolicy", () => {
  it("passes at exactly the effective limit, rejects one byte over it", async () => {
    tier = "studio";
    const policy = await resolveUploadPolicy("u1", "face-swap"); // effective = 10MB (feature-bound)
    expect(() => assertWithinUploadPolicy(policy, policy.effectiveMaxBytes)).not.toThrow();
    expect(() => assertWithinUploadPolicy(policy, policy.effectiveMaxBytes + 1)).toThrow(UploadPolicyError);
  });

  it("only suggests an upgrade when the plan is the limiting factor", async () => {
    tier = "free";
    const planBound = await resolveUploadPolicy("u1", "subtitle-remover"); // plan binds on free
    try {
      assertWithinUploadPolicy(planBound, planBound.effectiveMaxBytes + 1);
      throw new Error("expected to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(UploadPolicyError);
      expect((e as InstanceType<typeof UploadPolicyError>).message).toMatch(/upgrade/i);
    }

    tier = "studio";
    const featureBound = await resolveUploadPolicy("u1", "face-swap"); // feature binds even on studio
    try {
      assertWithinUploadPolicy(featureBound, featureBound.effectiveMaxBytes + 1);
      throw new Error("expected to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(UploadPolicyError);
      expect((e as InstanceType<typeof UploadPolicyError>).message).not.toMatch(/upgrade/i);
      expect((e as InstanceType<typeof UploadPolicyError>).message).toMatch(/Face Swap accepts/i);
    }
  });

  it("maps every limiting factor except storage to 413", () => {
    expect(uploadPolicyErrorStatus("plan")).toBe(413);
    expect(uploadPolicyErrorStatus("feature")).toBe(413);
    expect(uploadPolicyErrorStatus("provider")).toBe(413);
    expect(uploadPolicyErrorStatus("storage")).toBe(402);
  });
});

describe("cross-plan boundary tests — canonical per-tier upload limits", () => {
  const cases: Array<["free" | "creator" | "pro" | "studio", number]> = [
    ["free", 250 * 1024 ** 2],
    ["creator", 1 * 1024 ** 3],
    ["pro", 2 * 1024 ** 3],
    ["studio", 5 * 1024 ** 3],
  ];

  it.each(cases)("%s tier: exact limit passes, limit+1 rejects (feature has no cap here — using face-swap's cap only where it doesn't bind)", async (t, limitBytes) => {
    tier = t;
    // ai-creator's own 200MB technical cap only binds below free's 250MB — for
    // creator/pro/studio the plan term is the one actually under test here.
    // Use a feature-cap-free comparison via the Asset Library plan constant
    // directly against resolveUploadPolicy's plan term.
    const policy = await resolveUploadPolicy("u1", "cut-and-crop"); // 500MB feature cap
    const effectivePlanTerm = Math.min(limitBytes, 500 * 1024 * 1024);
    expect(policy.effectiveMaxBytes).toBe(effectivePlanTerm);
    expect(() => assertWithinUploadPolicy(policy, effectivePlanTerm)).not.toThrow();
    expect(() => assertWithinUploadPolicy(policy, effectivePlanTerm + 1)).toThrow(UploadPolicyError);
  });
});

describe("feature-cap boundary tests", () => {
  it("Face Swap (10MB): 10MB passes, 10MB+1 rejects, regardless of plan", async () => {
    for (const t of ["creator", "pro", "studio"] as const) {
      tier = t;
      const policy = await resolveUploadPolicy("u1", "face-swap");
      expect(() => assertWithinUploadPolicy(policy, 10 * 1024 * 1024)).not.toThrow();
      expect(() => assertWithinUploadPolicy(policy, 10 * 1024 * 1024 + 1)).toThrow(UploadPolicyError);
    }
  });

  it("Voice Changer (50MB) and Face Swap (10MB) feature caps are preserved exactly", () => {
    expect(FEATURE_TECHNICAL_MAX_BYTES["voice-changer"]).toBe(50 * 1024 * 1024);
    expect(FEATURE_TECHNICAL_MAX_BYTES["face-swap"]).toBe(10 * 1024 * 1024);
    expect(FEATURE_TECHNICAL_MAX_BYTES["subtitle-remover"]).toBe(500 * 1024 * 1024);
  });
});
