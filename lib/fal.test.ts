import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// lib/fal.ts is the one fal.ai queue client. These pin the three bugs that kept
// the background remover from ever succeeding (2026-11 audit): uploads to a
// host that doesn't exist, status URLs that kept a model's sub-path (fal
// answers those with 405), and cancels that never reached fal.

vi.mock("@/lib/env", () => ({ env: { FAL_KEY: "test-fal-key" } }));

const upload = vi.fn<(b: Blob) => Promise<string>>();
const config = vi.fn();
vi.mock("@fal-ai/client", () => ({ fal: { config: (...a: unknown[]) => config(...a), storage: { upload: (b: Blob) => upload(b) } } }));

const { falQueueBase, falRequestUrls, falSubmit, falPollUntilDone, falCancel, falUpload, FalCancelledError } = await import("./fal");

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  upload.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("falQueueBase", () => {
  it("drops a model's sub-path, as the official client does", () => {
    expect(falQueueBase("fal-ai/imageutils/rembg")).toBe("https://queue.fal.run/fal-ai/imageutils");
    expect(falQueueBase("fal-ai/ideogram/v4/fast")).toBe("https://queue.fal.run/fal-ai/ideogram");
    expect(falQueueBase("bytedance/seedream/v5/lite/text-to-image")).toBe("https://queue.fal.run/bytedance/seedream");
  });

  it("leaves a plain owner/alias id alone", () => {
    expect(falQueueBase("fal-ai/face-swap")).toBe("https://queue.fal.run/fal-ai/face-swap");
    expect(falQueueBase("fal-ai/demucs")).toBe("https://queue.fal.run/fal-ai/demucs");
  });

  it("keeps the namespace of a workflows/comfy id", () => {
    expect(falQueueBase("workflows/acme/my-flow/run")).toBe("https://queue.fal.run/workflows/acme/my-flow");
  });
});

describe("falRequestUrls", () => {
  it("prefers the URLs fal sent back on submit", () => {
    expect(falRequestUrls("fal-ai/imageutils/rembg", "r1", {
      status_url: "https://queue.fal.run/fal-ai/imageutils/requests/r1/status",
      response_url: "https://queue.fal.run/fal-ai/imageutils/requests/r1",
      cancel_url: "https://queue.fal.run/fal-ai/imageutils/requests/r1/cancel",
    })).toEqual({
      statusUrl: "https://queue.fal.run/fal-ai/imageutils/requests/r1/status",
      responseUrl: "https://queue.fal.run/fal-ai/imageutils/requests/r1",
      cancelUrl: "https://queue.fal.run/fal-ai/imageutils/requests/r1/cancel",
    });
  });

  it("builds them without the sub-path when fal sent none (or junk)", () => {
    expect(falRequestUrls("fal-ai/imageutils/rembg", "r1", { status_url: "javascript:alert(1)" })).toEqual({
      statusUrl: "https://queue.fal.run/fal-ai/imageutils/requests/r1/status",
      responseUrl: "https://queue.fal.run/fal-ai/imageutils/requests/r1",
      cancelUrl: "https://queue.fal.run/fal-ai/imageutils/requests/r1/cancel",
    });
  });
});

describe("falUpload", () => {
  it("goes through the official client's storage upload, never storage.fal.run", async () => {
    upload.mockResolvedValue("https://v3.fal.media/files/abc.png");
    const url = await falUpload(Buffer.from("png"), "image/png");
    expect(url).toBe("https://v3.fal.media/files/abc.png");
    expect(config).toHaveBeenCalledWith({ credentials: "test-fal-key" });
    expect((upload.mock.calls[0][0] as Blob).type).toBe("image/png");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("doesn't retry a 4xx (a locked account or bad key won't change)", async () => {
    upload.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403, body: { detail: "User is locked. Reason: Exhausted balance." } }));
    // fal's own reason, not the bare "Forbidden" the client's error carries.
    await expect(falUpload(Buffer.from("x"), "image/png")).rejects.toThrow("fal.ai upload failed 403: User is locked. Reason: Exhausted balance.");
    expect(upload).toHaveBeenCalledTimes(1);
  });
});

describe("falSubmit", () => {
  it("returns the request with fal's status/response/cancel URLs", async () => {
    fetchMock.mockResolvedValueOnce(json({
      request_id: "r1",
      status_url: "https://queue.fal.run/fal-ai/imageutils/requests/r1/status",
      response_url: "https://queue.fal.run/fal-ai/imageutils/requests/r1",
    }));
    const req = await falSubmit("fal-ai/imageutils/rembg", { image_url: "https://x/y.png" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://queue.fal.run/fal-ai/imageutils/rembg");
    expect(req).toMatchObject({
      endpoint: "fal-ai/imageutils/rembg",
      requestId: "r1",
      statusUrl: "https://queue.fal.run/fal-ai/imageutils/requests/r1/status",
      responseUrl: "https://queue.fal.run/fal-ai/imageutils/requests/r1",
      cancelUrl: "https://queue.fal.run/fal-ai/imageutils/requests/r1/cancel",
    });
  });

  it("surfaces fal's refusal (e.g. an exhausted balance)", async () => {
    fetchMock.mockResolvedValue(new Response('{"detail":"User is locked. Reason: Exhausted balance."}', { status: 403 }));
    await expect(falSubmit("fal-ai/imageutils/rembg", {})).rejects.toThrow(/403.*Exhausted balance/);
  });
});

const REQ = {
  endpoint: "fal-ai/imageutils/rembg",
  requestId: "r1",
  statusUrl: "https://queue.fal.run/fal-ai/imageutils/requests/r1/status",
  responseUrl: "https://queue.fal.run/fal-ai/imageutils/requests/r1",
  cancelUrl: "https://queue.fal.run/fal-ai/imageutils/requests/r1/cancel",
};

describe("falPollUntilDone", () => {
  it("polls the status URL and returns the result once COMPLETED", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ status: "IN_QUEUE" }))
      .mockResolvedValueOnce(json({ status: "COMPLETED" }))
      .mockResolvedValueOnce(json({ image: { url: "https://v3.fal.media/out.png" } }));
    const raw = await falPollUntilDone(REQ, { pollIntervalMs: 1 });
    expect(raw).toEqual({ image: { url: "https://v3.fal.media/out.png" } });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([REQ.statusUrl, REQ.statusUrl, REQ.responseUrl]);
  });

  it("fails fast on a status URL fal keeps refusing, instead of waiting out the deadline", async () => {
    fetchMock.mockImplementation(async () => new Response("", { status: 405 }));
    await expect(falPollUntilDone(REQ, { pollIntervalMs: 1, deadlineMs: 60_000 })).rejects.toThrow(/status check failed 405/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rides out a transient 5xx/429", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("", { status: 502 }))
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(json({ status: "COMPLETED" }))
      .mockResolvedValueOnce(json({ ok: 1 }));
    await expect(falPollUntilDone(REQ, { pollIntervalMs: 1 })).resolves.toEqual({ ok: 1 });
  });

  it("throws fal's error on FAILED", async () => {
    fetchMock.mockResolvedValueOnce(json({ status: "FAILED", error: "bad image" }));
    await expect(falPollUntilDone(REQ, { pollIntervalMs: 1 })).rejects.toThrow("bad image");
  });

  it("stops when its signal is aborted (the job was cancelled)", async () => {
    const abort = new AbortController();
    fetchMock.mockImplementation(async () => { abort.abort(); return json({ status: "IN_PROGRESS" }); });
    await expect(falPollUntilDone(REQ, { pollIntervalMs: 1, signal: abort.signal })).rejects.toBeInstanceOf(FalCancelledError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("falCancel", () => {
  it("PUTs the cancel URL", async () => {
    fetchMock.mockResolvedValueOnce(json({ status: "CANCELLATION_REQUESTED" }, 202));
    await falCancel(REQ);
    expect(fetchMock.mock.calls[0][0]).toBe(REQ.cancelUrl);
    expect(fetchMock.mock.calls[0][1]?.method).toBe("PUT");
  });

  it("never throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(falCancel(REQ)).resolves.toBeUndefined();
  });
});
