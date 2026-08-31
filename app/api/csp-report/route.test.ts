import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (handler: unknown) => handler }));

const warn = vi.fn();
vi.mock("@/lib/logger", () => ({ logger: { warn, error: vi.fn(), info: vi.fn() } }));

const { POST } = await import("./route");

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/csp-report", {
    method: "POST",
    headers: { "Content-Type": "application/csp-report" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/csp-report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs a well-formed violation report and returns 204", async () => {
    const res = await POST(post({ "csp-report": { "blocked-uri": "https://evil.example/x.js", "violated-directive": "script-src" } }));
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("does not throw on a malformed body — just skips logging", async () => {
    const req = new NextRequest("http://localhost/api/csp-report", { method: "POST", body: "not json" });
    const res = await POST(req);
    expect(res.status).toBe(204);
    expect(warn).not.toHaveBeenCalled();
  });
});
