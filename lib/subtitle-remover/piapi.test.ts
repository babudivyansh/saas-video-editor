import { describe, it, expect, vi, afterEach } from "vitest";
import { createRemoveSubtitleTask, waitForTask, isSafeResultUrl, PiapiError } from "./piapi";

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const task = (status: string, extra: Record<string, unknown> = {}) =>
  ({ code: 200, message: "success", data: { task_id: "t1", status, output: null, error: { code: 0, message: "" }, ...extra } });

afterEach(() => vi.unstubAllGlobals());

describe("createRemoveSubtitleTask", () => {
  it("posts the documented body with the x-api-key header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, task("pending")));
    vi.stubGlobal("fetch", fetchMock);
    const t = await createRemoveSubtitleTask("k", "https://bucket/x.mp4");
    expect(t).toMatchObject({ taskId: "t1", status: "pending", videoUrl: null });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.piapi.ai/api/v1/task");
    expect(init.method).toBe("POST");
    expect(init.headers["x-api-key"]).toBe("k");
    expect(JSON.parse(init.body)).toEqual({ model: "Qubico/video-toolkit", task_type: "remove-subtitle", input: { video: "https://bucket/x.mp4" } });
  });

  it("does not retry a refused create (it could start a second paid task)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(400, { code: 400, message: "region exceeds the video dimensions" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createRemoveSubtitleTask("k", "https://x/y.mp4", { x: 0, y: 0, width: 9999, height: 1 }))
      .rejects.toThrow(/region exceeds/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("waitForTask", () => {
  const noSleep = () => Promise.resolve();

  it("polls until completed and returns output.video_url", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply(200, task("pending")))
      .mockResolvedValueOnce(reply(200, task("processing")))
      .mockResolvedValueOnce(reply(200, task("completed", { output: { video_url: "https://cdn.piapi.ai/out.mp4" } })));
    vi.stubGlobal("fetch", fetchMock);
    const seen: string[] = [];
    await expect(waitForTask("k", "t1", { timeoutMs: 60_000, sleep: noSleep, onStatus: (s) => seen.push(s) }))
      .resolves.toBe("https://cdn.piapi.ai/out.mp4");
    expect(seen).toEqual(["pending", "processing", "completed"]);
  });

  it("throws with the provider's message when the task fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(200, task("failed", { error: { code: 10000, message: "processing timeout" } }))));
    await expect(waitForTask("k", "t1", { timeoutMs: 60_000, sleep: noSleep })).rejects.toThrow(/failed: processing timeout/);
  });

  it("stops as soon as the job is cancelled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(waitForTask("k", "t1", { timeoutMs: 60_000, sleep: noSleep, shouldStop: () => true })).rejects.toBeInstanceOf(PiapiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gives up after the timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(reply(200, task("processing")))));
    await expect(waitForTask("k", "t1", { timeoutMs: -1, sleep: noSleep })).rejects.toThrow(/still processing/);
  });
});

describe("isSafeResultUrl", () => {
  it("only allows public https addresses", () => {
    expect(isSafeResultUrl("https://img.theapi.app/out.mp4")).toBe(true);
    expect(isSafeResultUrl("http://img.theapi.app/out.mp4")).toBe(false);
    expect(isSafeResultUrl("https://127.0.0.1/x")).toBe(false);
    expect(isSafeResultUrl("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isSafeResultUrl("https://192.168.1.2/x")).toBe(false);
    expect(isSafeResultUrl("https://localhost/x")).toBe(false);
    expect(isSafeResultUrl("https://[::1]/x")).toBe(false);
    expect(isSafeResultUrl("not a url")).toBe(false);
  });
});
