import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockEnv, redisGet, redisSet, redisDel, redisIncr } = vi.hoisted(() => ({
  mockEnv: {} as Record<string, string | undefined>,
  redisGet: vi.fn(async () => null as string | null),
  redisSet: vi.fn(async () => {}),
  redisDel: vi.fn(async () => {}),
  redisIncr: vi.fn(async () => 1),
}));

vi.mock("@/lib/env", () => ({ env: mockEnv }));
vi.mock("@/lib/redis", () => ({
  redis: { get: redisGet, set: redisSet, del: redisDel, incrWithExpire: redisIncr },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { listTemplates, listLanguages, getProject, createProject, isSubmagicConfigured } =
  await import("./SubmagicClient");
const { SubmagicError } = await import("./SubmagicErrors");

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  for (const k of Object.keys(mockEnv)) delete mockEnv[k];
  mockEnv.SUBMAGIC_API_KEY = "sk-test-key";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  redisIncr.mockResolvedValue(1);
});

describe("configuration", () => {
  it("reports unconfigured without a key, and refuses to call out", async () => {
    delete mockEnv.SUBMAGIC_API_KEY;
    expect(isSubmagicConfigured()).toBe(false);
    await expect(listTemplates()).rejects.toMatchObject({ errorClass: "permanent" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("listTemplates", () => {
  it("sends the key as x-api-key and never in the URL", async () => {
    // A key in a query string ends up in access logs and referrers.
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { templates: ["Beast", "Hormozi 1"] }));
    await listTemplates();

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.submagic.co/v1/templates");
    expect(String(url)).not.toContain("sk-test-key");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("sk-test-key");
  });

  it("returns the flat name array the live API actually sends", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { templates: ["Beast", "Ali", "Sara"] }));
    expect(await listTemplates()).toEqual(["Beast", "Ali", "Sara"]);
  });

  it("returns [] rather than throwing on an unexpected body shape", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { nope: true }));
    expect(await listTemplates()).toEqual([]);
  });

  it("honours a custom base URL", async () => {
    mockEnv.SUBMAGIC_BASE_URL = "https://staging.example.com/";
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { templates: [] }));
    await listTemplates();
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://staging.example.com/v1/templates");
  });
});

describe("listLanguages", () => {
  it("parses the { name, code } shape", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { languages: [{ name: "🇮🇳 Hindi", code: "hi" }, { name: "🇺🇸 English", code: "en" }] }),
    );
    expect(await listLanguages()).toEqual([
      { name: "🇮🇳 Hindi", code: "hi" },
      { name: "🇺🇸 English", code: "en" },
    ]);
  });
});

describe("error classification over the wire", () => {
  it("maps a 401 to a permanent error and does not retry", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "UNAUTHORIZED", message: "Invalid or missing API key" }));
    await expect(getProject("11111111-1111-1111-1111-111111111111")).rejects.toMatchObject({
      errorClass: "permanent",
      code: "UNAUTHORIZED",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a read on 5xx", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(503, { error: "UNAVAILABLE" }))
      .mockResolvedValueOnce(jsonResponse(200, { templates: ["Beast"] }));
    expect(await listTemplates()).toEqual(["Beast"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never retries a PAID call, even on a retryable-looking failure", async () => {
    // This is the double-charge guard: the provider may have created (and
    // billed for) the project before failing to answer.
    fetchMock.mockResolvedValue(jsonResponse(503, { error: "UNAVAILABLE" }));
    await expect(
      createProject({
        title: "t", language: "en", videoUrl: "https://example.com/v.mp4", templateName: "Beast",
        magicZooms: false, magicBrolls: false, removeBadTakes: false, cleanAudio: false,
        hookTitle: false, autoRender: false,
      }),
    ).rejects.toMatchObject({ errorClass: "unknown_provider_state" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("classifies a network throw on a paid call as unknown, not failed", async () => {
    fetchMock.mockRejectedValue(new Error("socket hang up"));
    await expect(
      createProject({
        title: "t", language: "en", videoUrl: "https://example.com/v.mp4", templateName: "Beast",
        magicZooms: false, magicBrolls: false, removeBadTakes: false, cleanAudio: false,
        hookTitle: false, autoRender: false,
      }),
    ).rejects.toMatchObject({ errorClass: "unknown_provider_state" });
  });

  it("does not leak the API key in an error message", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: "BOOM" }));
    const err = await listTemplates().catch((e) => e);
    expect(err).toBeInstanceOf(SubmagicError);
    expect(String(err.message)).not.toContain("sk-test-key");
  });
});

describe("createProject", () => {
  it("always sends autoRender:false so captions can be edited before paying to render", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: "uuid-1", status: "processing" }));
    await createProject({
      title: "t", language: "en", videoUrl: "https://example.com/v.mp4", templateName: "Beast",
      magicZooms: false, magicBrolls: false, removeBadTakes: false, cleanAudio: false,
      hookTitle: false, autoRender: false,
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.autoRender).toBe(false);
    // Everything that overlaps a Clipiro-owned feature stays off by default.
    expect(body).toMatchObject({ magicBrolls: false, magicZooms: false, cleanAudio: false, removeBadTakes: false });
  });

  it("is throttled by the local rate limiter before any request goes out", async () => {
    mockEnv.SUBMAGIC_CREATE_RATE_MAX = "2";
    redisIncr.mockResolvedValue(3); // already over the window's budget
    await expect(
      createProject({
        title: "t", language: "en", videoUrl: "https://example.com/v.mp4", templateName: "Beast",
        magicZooms: false, magicBrolls: false, removeBadTakes: false, cleanAudio: false,
        hookTitle: false, autoRender: false,
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", errorClass: "safe_to_retry" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails OPEN when Redis is unavailable rather than blocking every render", async () => {
    redisIncr.mockRejectedValue(new Error("redis down"));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: "uuid-2" }));
    await expect(
      createProject({
        title: "t", language: "en", videoUrl: "https://example.com/v.mp4", templateName: "Beast",
        magicZooms: false, magicBrolls: false, removeBadTakes: false, cleanAudio: false,
        hookTitle: false, autoRender: false,
      }),
    ).resolves.toMatchObject({ id: "uuid-2" });
  });
});
