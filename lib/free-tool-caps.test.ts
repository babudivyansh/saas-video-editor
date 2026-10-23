import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// freeToolGate: kill switch (free tools never checked it), per-USER caps for
// signed-in callers (were per IP, so a shared NAT shared one allowance), and
// a readable error (was the code "daily_limit_reached").

let enabled = true;
let session: { userId: string } | null = null;
const keys: string[] = [];
let allowed = true;

vi.mock("@/lib/tool-config", () => ({ getToolConfig: vi.fn(async () => ({ enabled, creditCost: 0 })) }));
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => session) }));
vi.mock("@/lib/rate-limit", () => ({
  getClientIp: () => "203.0.113.9",
  rateLimit: vi.fn(async (key: string) => { keys.push(key); return { allowed, remaining: 0 }; }),
}));

const { freeToolGate, freeToolCapResponseBody } = await import("./free-tool-caps");
const req = () => new NextRequest("http://l/api/tools/mp3-converter", { method: "POST" });

beforeEach(() => { enabled = true; session = null; keys.length = 0; allowed = true; });

describe("freeToolGate", () => {
  it("503s a tool switched off in admin", async () => {
    enabled = false;
    const res = await freeToolGate(req(), "mp3-converter");
    expect((res as NextResponse).status).toBe(503);
  });

  it("keys a signed-in caller's daily cap by user, with no IP hourly limit", async () => {
    session = { userId: "u1" };
    const res = await freeToolGate(req(), "mp3-converter");
    expect(res).toEqual({ auth: { userId: "u1" } });
    expect(keys).toEqual(["freetool:mp3-converter:user:u1"]);
  });

  it("keys an anonymous caller by IP, with the hourly limit too", async () => {
    await freeToolGate(req(), "mp3-converter");
    expect(keys).toEqual(["mp3-converter:ip:203.0.113.9", "free-tools:anonymous:all", "freetool:mp3-converter:ip:203.0.113.9"]);
  });

  it("returns a sentence the UI can show, not a code", async () => {
    session = { userId: "u1" };
    allowed = false;
    const res = (await freeToolGate(req(), "mp3-converter")) as NextResponse;
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe("daily_limit_reached");
    expect(body.error).toMatch(/free uses of this tool/);
    expect(freeToolCapResponseBody("mp3-converter", 15).error).not.toMatch(/upgrade/i);
  });
});
