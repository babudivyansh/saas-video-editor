import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const upsert = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { marketingEventDaily: { upsert } } }));

// Bypass Redis — the wrapper's own behaviour is tested elsewhere.
vi.mock("@/lib/with-rate-limit", () => ({
  withRateLimit: (handler: unknown) => handler,
}));

const { POST } = await import("./route");

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/marketing/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valid = { event: "cta_click", path: "/blog/hooks-that-stop-the-scroll", placement: "mid_article" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/marketing/event", () => {
  it("records a valid event", async () => {
    const res = await POST(post(valid));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("keys the upsert on the full dimension tuple", async () => {
    await POST(post({ ...valid, utmSource: "twitter", utmMedium: "social", utmCampaign: "launch" }));
    const [{ where, create }] = upsert.mock.calls[0] as [
      { where: Record<string, Record<string, string>>; create: Record<string, unknown> },
    ];
    expect(Object.keys(where)).toEqual(["date_event_path_placement_utmSource_utmMedium_utmCampaign"]);
    expect(create).toMatchObject({ utmSource: "twitter", utmMedium: "social", utmCampaign: "launch", count: 1 });
  });

  it("defaults absent UTM values to empty strings, never null", async () => {
    await POST(post(valid));
    const [{ create }] = upsert.mock.calls[0] as [{ create: Record<string, unknown> }];
    // Postgres treats NULLs as distinct in a unique index, so nulls here would
    // silently defeat the upsert and accumulate duplicate rows forever.
    expect(create).toMatchObject({ utmSource: "", utmMedium: "", utmCampaign: "" });
  });

  // The cardinality defense: UTM values are attacker-controlled and land in a
  // unique index, so anything unreasonable has to collapse to one bucket.
  it("collapses an over-long UTM value to 'other' rather than storing it", async () => {
    await POST(post({ ...valid, utmCampaign: "a".repeat(500) }));
    const [{ create }] = upsert.mock.calls[0] as [{ create: Record<string, string> }];
    expect(create.utmCampaign).toBe("other");
  });

  it("collapses a UTM value with unexpected characters to 'other'", async () => {
    await POST(post({ ...valid, utmSource: "<script>alert(1)</script>" }));
    const [{ create }] = upsert.mock.calls[0] as [{ create: Record<string, string> }];
    expect(create.utmSource).toBe("other");
  });

  it("rejects an unknown placement", async () => {
    const res = await POST(post({ ...valid, placement: "somewhere_else" }));
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects an unknown event", async () => {
    const res = await POST(post({ ...valid, event: "arbitrary_event" }));
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects unexpected keys (strict schema)", async () => {
    const res = await POST(post({ ...valid, userId: "u1" }));
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  // A full URL can carry PII in its query string; this table is meant to be
  // anonymous and aggregate.
  it("rejects an absolute URL or a path with a query string", async () => {
    for (const path of ["https://evil.test/x", "/blog?email=a@b.com", "/blog#frag"]) {
      const res = await POST(post({ ...valid, path }));
      expect(res.status).toBe(400);
    }
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns 400 rather than throwing on a malformed body", async () => {
    const req = new NextRequest("http://localhost/api/marketing/event", { method: "POST", body: "not json" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // recordMarketingEvent swallows sink failures by design — a broken analytics
  // write must not fail the request it is attached to.
  it("still returns 200 when the database write fails", async () => {
    upsert.mockRejectedValueOnce(new Error("db down"));
    const res = await POST(post(valid));
    expect(res.status).toBe(200);
  });
});
