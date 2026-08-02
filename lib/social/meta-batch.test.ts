import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  MAX_BATCH_SIZE,
  batchMostlyFailed,
  graphBatch,
  successfulBodies,
  type BatchRequest,
} from "./meta-batch";
import { ProviderApiError } from "./errors";

const ROOT = "https://graph.facebook.com/v22.0";
const TOKEN = "tok_123";

const req = (n: number): BatchRequest => ({ method: "GET", relative_url: `${n}/insights?metric=reach` });
const reqs = (n: number) => Array.from({ length: n }, (_, i) => req(i));

/** Build a Meta batch response: one entry per sub-request. */
function batchResponse(entries: Array<{ code: number; body: unknown } | null>) {
  return {
    ok: true,
    status: 200,
    json: async () => entries.map((e) => (e === null ? null : { code: e.code, body: JSON.stringify(e.body) })),
    text: async () => "",
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chunking", () => {
  it("sends nothing and returns nothing for an empty list", async () => {
    await expect(graphBatch(ROOT, [], TOKEN)).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends one request for a batch at the ceiling", async () => {
    fetchMock.mockResolvedValue(batchResponse(reqs(MAX_BATCH_SIZE).map(() => ({ code: 200, body: {} }))));
    await graphBatch(ROOT, reqs(MAX_BATCH_SIZE), TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("turns 100 posts into 2 HTTP calls — the whole point of this module", async () => {
    fetchMock
      .mockResolvedValueOnce(batchResponse(reqs(50).map(() => ({ code: 200, body: { ok: 1 } }))))
      .mockResolvedValueOnce(batchResponse(reqs(50).map(() => ({ code: 200, body: { ok: 1 } }))));
    const out = await graphBatch(ROOT, reqs(100), TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out).toHaveLength(100);
  });

  it("handles a final partial chunk", async () => {
    fetchMock
      .mockResolvedValueOnce(batchResponse(reqs(50).map(() => ({ code: 200, body: {} }))))
      .mockResolvedValueOnce(batchResponse(reqs(3).map(() => ({ code: 200, body: {} }))));
    expect(await graphBatch(ROOT, reqs(53), TOKEN)).toHaveLength(53);
  });
});

describe("request construction", () => {
  it("POSTs the batch with the token in the body, never the URL", async () => {
    fetchMock.mockResolvedValue(batchResponse([{ code: 200, body: {} }]));
    await graphBatch(ROOT, [req(1)], TOKEN);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(ROOT);
    expect(init.method).toBe("POST");
    // A token in a query string lands in access logs and proxy caches.
    expect(String(url)).not.toContain(TOKEN);

    const body = init.body as URLSearchParams;
    expect(body.get("access_token")).toBe(TOKEN);
    expect(JSON.parse(body.get("batch")!)).toEqual([req(1)]);
  });
});

describe("result ordering and mapping", () => {
  it("returns results positionally aligned with the input", async () => {
    fetchMock.mockResolvedValue(
      batchResponse([
        { code: 200, body: { id: "first" } },
        { code: 200, body: { id: "second" } },
        { code: 200, body: { id: "third" } },
      ]),
    );
    const out = await graphBatch<{ id: string }>(ROOT, reqs(3), TOKEN);
    expect(out.map((r) => (r.ok ? r.body.id : null))).toEqual(["first", "second", "third"]);
  });

  it("keeps positions stable when a middle sub-request fails", async () => {
    fetchMock.mockResolvedValue(
      batchResponse([
        { code: 200, body: { id: "a" } },
        { code: 400, body: { error: { message: "Unsupported metric", code: 100 } } },
        { code: 200, body: { id: "c" } },
      ]),
    );
    const out = await graphBatch<{ id: string }>(ROOT, reqs(3), TOKEN);
    expect(out[0].ok).toBe(true);
    expect(out[1].ok).toBe(false);
    expect(out[2].ok).toBe(true);
    expect((out[2] as { ok: true; body: { id: string } }).body.id).toBe("c");
  });
});

describe("partial failure", () => {
  it("does not throw when one sub-request fails — 49 posts must survive the 50th", async () => {
    const entries = reqs(50).map((_, i) =>
      i === 7 ? { code: 400, body: { error: { message: "no insights" } } } : { code: 200, body: { v: i } },
    );
    fetchMock.mockResolvedValue(batchResponse(entries));
    const out = await graphBatch(ROOT, reqs(50), TOKEN);
    expect(out.filter((r) => r.ok)).toHaveLength(49);
  });

  it("extracts Meta's error message and code", async () => {
    fetchMock.mockResolvedValue(
      batchResponse([{ code: 400, body: { error: { message: "Unsupported get request", code: 100 } } }]),
    );
    const [result] = await graphBatch(ROOT, [req(1)], TOKEN);
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect((result as { error: string }).error).toBe("Unsupported get request (code 100)");
  });

  it("treats a null entry as a sub-request timeout", async () => {
    fetchMock.mockResolvedValue(batchResponse([null]));
    expect(await graphBatch(ROOT, [req(1)], TOKEN)).toEqual([
      { ok: false, error: "sub-request timed out", status: 504 },
    ]);
  });

  it("reports a malformed sub-body without throwing", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ code: 200, body: "not json{" }],
      text: async () => "",
    });
    const [result] = await graphBatch(ROOT, [req(1)], TOKEN);
    expect(result).toMatchObject({ ok: false, error: "malformed sub-response body" });
  });

  it("bounds an unparseable error body so it cannot flood logs", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ code: 500, body: "x".repeat(10_000) }],
      text: async () => "",
    });
    const [result] = await graphBatch(ROOT, [req(1)], TOKEN);
    expect((result as { error: string }).error.length).toBeLessThanOrEqual(200);
  });
});

describe("transport failure", () => {
  it("throws ProviderApiError when the batch call itself fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, text: async () => "rate limited" });
    await expect(graphBatch(ROOT, [req(1)], TOKEN)).rejects.toBeInstanceOf(ProviderApiError);
  });

  it("preserves the status so classifyError can decide on a retry", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, text: async () => "rate limited" });
    await expect(graphBatch(ROOT, [req(1)], TOKEN)).rejects.toMatchObject({ status: 429 });
  });

  it("throws on a non-array response", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ error: "nope" }), text: async () => "" });
    await expect(graphBatch(ROOT, [req(1)], TOKEN)).rejects.toBeInstanceOf(ProviderApiError);
  });

  it("throws on malformed top-level JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new Error("bad json"); },
      text: async () => "",
    });
    await expect(graphBatch(ROOT, [req(1)], TOKEN)).rejects.toBeInstanceOf(ProviderApiError);
  });
});

describe("helpers", () => {
  it("successfulBodies keeps only the successes", () => {
    expect(
      successfulBodies([
        { ok: true, body: 1 },
        { ok: false, error: "x", status: 400 },
        { ok: true, body: 3 },
      ]),
    ).toEqual([1, 3]);
  });

  it("batchMostlyFailed tolerates a few missing insights", () => {
    const results = Array.from({ length: 10 }, (_, i) =>
      i < 2 ? { ok: false as const, error: "x", status: 400 } : { ok: true as const, body: i },
    );
    expect(batchMostlyFailed(results)).toBe(false);
  });

  it("batchMostlyFailed flags a broadly failing batch", () => {
    const results = Array.from({ length: 10 }, (_, i) =>
      i < 8 ? { ok: false as const, error: "x", status: 400 } : { ok: true as const, body: i },
    );
    expect(batchMostlyFailed(results)).toBe(true);
  });

  it("batchMostlyFailed is false for an empty batch", () => {
    expect(batchMostlyFailed([])).toBe(false);
  });
});
