import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const requireAdminMock = vi.fn(async () => ({ userId: "admin-1", email: "admin@test.co" }));
vi.mock("@/lib/auth", () => ({
  requireAdmin: (req: NextRequest) => requireAdminMock(req),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
// Elevated by default; individual tests flip this to exercise the step-up gate.
let elevated = true;
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (key: string) => (key.startsWith("admin-elevated:") && elevated ? "1" : null)),
    set: vi.fn(async () => {}),
    del: vi.fn(async () => {}),
    incrWithExpire: vi.fn(async () => 1),
  },
}));

const { withAdmin, parseBody } = await import("./api");
const { logger } = await import("@/lib/logger");

function req(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/test", {
    method: "POST",
    ...(body !== undefined ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });
}

describe("withAdmin", () => {
  it("returns 403 when requireAdmin yields null", async () => {
    requireAdminMock.mockResolvedValueOnce(null as never);
    const handler = withAdmin(async () => NextResponse.json({ ok: true }));
    const res = await handler(req());
    expect(res.status).toBe(403);
  });

  it("returns 403 elevation_required for a non-elevated admin (step-up gate)", async () => {
    elevated = false;
    try {
      const handler = withAdmin(async () => NextResponse.json({ ok: true }));
      const res = await handler(req());
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("elevation_required");
    } finally {
      elevated = true;
    }
  });

  it("passes admin + resolved params to the handler", async () => {
    const handler = withAdmin<{ id: string }>(async (_req, { admin, params }) =>
      NextResponse.json({ admin: admin.userId, id: params.id }),
    );
    const res = await handler(req(), { params: Promise.resolve({ id: "x1" }) });
    expect(await res.json()).toEqual({ admin: "admin-1", id: "x1" });
  });

  it("maps ZodError to 400 with an issues array", async () => {
    const schema = z.object({ months: z.number().int().max(24) }).strict();
    const handler = withAdmin(async (r) => {
      await parseBody(r, schema);
      return NextResponse.json({ ok: true });
    });
    const res = await handler(req({ months: 99 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.issues[0].path).toBe("months");
  });

  it("maps malformed JSON to 400", async () => {
    const handler = withAdmin(async (r) => {
      await parseBody(r, z.object({}));
      return NextResponse.json({ ok: true });
    });
    const res = await handler(req("{not json"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON body");
  });

  it("maps Prisma P2025 to 404 and P2002 to 409", async () => {
    for (const [code, status] of [["P2025", 404], ["P2002", 409]] as const) {
      const handler = withAdmin(async () => {
        throw new Prisma.PrismaClientKnownRequestError("boom", { code, clientVersion: "7.0.0" });
      });
      const res = await handler(req());
      expect(res.status).toBe(status);
    }
  });

  it("maps unknown errors to a logged 500", async () => {
    const handler = withAdmin(async () => {
      throw new Error("kaboom");
    });
    const res = await handler(req());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Internal server error");
    expect(logger.error).toHaveBeenCalled();
  });
});
