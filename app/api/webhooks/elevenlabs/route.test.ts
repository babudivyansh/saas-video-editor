import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({ env: { ELEVENLABS_WEBHOOK_SECRET: "whsec_test" } }));

let verifyResult: { ok: true } | { ok: false; reason: string } = { ok: true };
vi.mock("@/lib/elevenlabs-webhook", () => ({
  verifyElevenLabsSignature: vi.fn(() => verifyResult),
}));

let dubByDubbingId: Record<string, { id: string; userId: string | null; refId: string | null; clip: { projectId: string } }> = {};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clipDub: {
      findUnique: vi.fn(async ({ where }: { where: { dubbingId: string } }) => dubByDubbingId[where.dubbingId] ?? null),
    },
  },
}));

const claimAndEnqueueFinish = vi.fn(async () => true);
vi.mock("@/lib/autoclip-dub", () => ({ claimAndEnqueueFinish: (...a: unknown[]) => claimAndEnqueueFinish(...a) }));

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { POST } = await import("./route");

function req(body: string, sig = "t=1,v1=abc") {
  return new NextRequest("http://localhost/api/webhooks/elevenlabs", {
    method: "POST",
    headers: { "elevenlabs-signature": sig },
    body,
  });
}

describe("POST /api/webhooks/elevenlabs", () => {
  it("rejects an invalid signature with 401 and never reads the payload", async () => {
    verifyResult = { ok: false, reason: "bad_signature" };
    const res = await POST(req(JSON.stringify({ data: { dubbing_id: "el-1" } })));
    expect(res.status).toBe(401);
    expect(claimAndEnqueueFinish).not.toHaveBeenCalled();
  });

  it("returns 400 on an unparseable body even with a valid signature", async () => {
    verifyResult = { ok: true };
    const res = await POST(req("not json"));
    expect(res.status).toBe(400);
  });

  it("200s an event with no dubbing_id without touching the DB (unrecognized event type)", async () => {
    verifyResult = { ok: true };
    const res = await POST(req(JSON.stringify({ type: "voice_removed", data: { voice_id: "v1" } })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(claimAndEnqueueFinish).not.toHaveBeenCalled();
  });

  it("200s without enqueueing when no ClipDub matches the dubbing_id", async () => {
    verifyResult = { ok: true };
    dubByDubbingId = {};
    const res = await POST(req(JSON.stringify({ data: { dubbing_id: "unknown-id" } })));
    expect(res.status).toBe(200);
    expect(claimAndEnqueueFinish).not.toHaveBeenCalled();
  });

  it("looks up the ClipDub and enqueues finishDubJob via claimAndEnqueueFinish for a known dubbing_id", async () => {
    verifyResult = { ok: true };
    const dub = { id: "dub1", userId: "u1", refId: "ref1", clip: { projectId: "proj1" } };
    dubByDubbingId = { "el-1": dub };

    const res = await POST(req(JSON.stringify({ data: { dubbing_id: "el-1" } })));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(claimAndEnqueueFinish).toHaveBeenCalledWith(dub);
  });

  it("accepts the camelCase dubbingId field path as a fallback", async () => {
    verifyResult = { ok: true };
    const dub = { id: "dub2", userId: "u2", refId: "ref2", clip: { projectId: "proj2" } };
    dubByDubbingId = { "el-2": dub };

    const res = await POST(req(JSON.stringify({ data: { dubbingId: "el-2" } })));

    expect(res.status).toBe(200);
    expect(claimAndEnqueueFinish).toHaveBeenCalledWith(dub);
  });

  it("still 200s when claimAndEnqueueFinish itself throws", async () => {
    verifyResult = { ok: true };
    const dub = { id: "dub3", userId: "u3", refId: "ref3", clip: { projectId: "proj3" } };
    dubByDubbingId = { "el-3": dub };
    claimAndEnqueueFinish.mockRejectedValueOnce(new Error("db unavailable"));

    const res = await POST(req(JSON.stringify({ data: { dubbing_id: "el-3" } })));
    expect(res.status).toBe(200);
  });
});
