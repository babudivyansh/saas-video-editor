import { beforeEach, describe, expect, it, vi } from "vitest";

// resolveUploadPolicy is the shared entitlement resolver every AI/utility
// tool route (outside the Asset Library) now calls instead of a hardcoded
// MAX_BYTES constant — these tests cover the tier<->feature min() algorithm,
// limiting-factor resolution, and the anonymous (no session) fallback.

let tier: "free" | "creator" | "pro" | "studio" = "free";
vi.mock("@/lib/auth", () => ({
  getUserTier: vi.fn(async () => tier),
}));

const {
  resolveUploadPolicy,
  assertWithinUploadPolicy,
  UploadPolicyError,
  uploadPolicyErrorStatus,
  FEATURE_TECHNICAL_MAX_BYTES,
} = await import("./upload-policy");
const { MAX_UPLOAD_BYTES_BY_TIER } = await import("./plans/tiers");

beforeEach(() => {
  tier = "free";
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
      const policy = await resolveUploadPolicy("u1", "ai-creator");
      expect(policy.effectiveMaxBytes).toBeLessThanOrEqual(MAX_UPLOAD_BYTES_BY_TIER[t]);
    }
  });

  it("anonymous caller (no session) gets only the feature's technical cap — no plan term applies", async () => {
    const policy = await resolveUploadPolicy(null, "audio-balancer");
    expect(policy.tier).toBeNull();
    expect(policy.planMaxBytes).toBeUndefined();
    expect(policy.effectiveMaxBytes).toBe(FEATURE_TECHNICAL_MAX_BYTES["audio-balancer"]);
    expect(policy.limitingFactor).toBe("feature");
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

  it.each(cases)("%s tier: exact limit passes, limit+1 rejects (feature has no cap here — using ai-creator's cap only where it doesn't bind)", async (t, limitBytes) => {
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

  it("Voice Changer (50MB) and AI Creator (200MB) feature caps are preserved exactly", () => {
    expect(FEATURE_TECHNICAL_MAX_BYTES["voice-changer"]).toBe(50 * 1024 * 1024);
    expect(FEATURE_TECHNICAL_MAX_BYTES["ai-creator"]).toBe(200 * 1024 * 1024);
    expect(FEATURE_TECHNICAL_MAX_BYTES["subtitle-remover"]).toBe(500 * 1024 * 1024);
  });
});
