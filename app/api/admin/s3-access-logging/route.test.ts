import { describe, expect, it, vi } from "vitest";

// Only the probe logic is under test — mock withAdmin so importing the route
// doesn't pull in the full auth/elevation chain, same approach already used
// by the sibling render-diagnostics/route.test.ts.
vi.mock("@/lib/admin/api", () => ({ withAdmin: (handler: unknown) => handler }));
vi.mock("@/lib/env", () => ({ env: { AWS_S3_BUCKET: "clipiro-prod" } }));

const send = vi.fn();
vi.mock("@/utils/s3-upload", () => ({ s3: { send: (...a: unknown[]) => send(...a) } }));

const { GET } = await import("./route");

describe("GET /api/admin/s3-access-logging", () => {
  it("reports enabled with the target bucket when logging is on", async () => {
    send.mockResolvedValueOnce({ LoggingEnabled: { TargetBucket: "clipiro-logs", TargetPrefix: "s3-access/" } });
    const res = await GET();
    const json = await res.json();
    expect(json).toEqual({ enabled: true, bucket: "clipiro-prod", targetBucket: "clipiro-logs", targetPrefix: "s3-access/" });
  });

  it("reports disabled (not an error) when the bucket has no logging configuration", async () => {
    send.mockResolvedValueOnce({});
    const res = await GET();
    const json = await res.json();
    expect(json.enabled).toBe(false);
  });

  it("reports 'could not verify' rather than a false 'disabled' when the check itself fails (e.g. AccessDenied)", async () => {
    send.mockRejectedValueOnce(new Error("AccessDenied: not authorized to perform s3:GetBucketLogging"));
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.enabled).toBeNull();
    expect(json.error).toContain("AccessDenied");
  });
});
