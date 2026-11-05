import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Route-level tests for the shared YouTube/Instagram downloader. yt-dlp,
// auth, credits and the daily cap are faked; the route logic runs for real.

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1" })) }));

const chargeCredits = vi.fn(async () => ({ ok: true, generationId: "g1" }));
vi.mock("@/lib/credits", () => ({
  chargeCredits: (...a: unknown[]) => chargeCredits(...(a as [])),
  refundCredits: vi.fn(),
  markGenerationStatus: vi.fn(),
  updateGenerationProgress: vi.fn(),
}));

const checkFreeToolDailyCap = vi.fn(async () => ({ allowed: true, cap: 25 }));
vi.mock("@/lib/free-tool-caps", () => ({
  checkFreeToolDailyCap: (...a: unknown[]) => checkFreeToolDailyCap(...(a as [])),
  freeToolCapResponseBody: () => ({ error: "Daily limit reached" }),
}));

vi.mock("@/lib/job-routes", () => ({
  createJobStatusHandler: () => vi.fn(),
  createJobCancelHandler: () => vi.fn(),
  idempotencyResponse: () => null,
}));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));

const loggerError = vi.fn();
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: (...a: unknown[]) => loggerError(...a) } }));

// The real ytDlpErrorText / YtDlpError run; only the process is faked.
const runYtDlp = vi.fn();
vi.mock("@/lib/ytdlp", async (orig) => ({
  ...(await orig<typeof import("./ytdlp")>()),
  runYtDlp: (...a: unknown[]) => runYtDlp(...a),
}));

const { createDownloaderRoute } = await import("./downloader-route");
const { YtDlpError } = await import("./ytdlp");

const route = createDownloaderRoute({
  slug: "youtube-downloader",
  label: "YouTube downloader",
  filePrefix: "ytdl-test",
  normalizeUrl: (raw) => (raw.startsWith("https://www.youtube.com/") ? raw : null),
  invalidUrlMessage: "bad link",
  infoBody: (info) => ({ title: info.title }),
  friendlyError: (raw) => (/bot/i.test(raw) ? "blocked" : "generic"),
  downloadBaseName: () => "video",
});

const URL_OK = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
const ytFailure = (stderr: string) => Object.assign(new Error(stderr), { stderr });

const get = (qs: string) => route.GET(new NextRequest(`http://localhost/api/tools/x?${qs}`));
const post = (body: unknown) =>
  route.POST(new NextRequest("http://localhost/api/tools/x", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET ?action=info", () => {
  it("returns the metadata", async () => {
    runYtDlp.mockResolvedValueOnce({ title: "Me at the zoo" });
    const res = await get(`action=info&url=${encodeURIComponent(URL_OK)}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ title: "Me at the zoo" });
    expect(runYtDlp.mock.calls[0][1]).toMatchObject({ dumpSingleJson: true });
  });

  it("logs the real yt-dlp cause to Sentry, not just 'info fetch failed'", async () => {
    // What production hit: the Python zipapp crashing on Python 3.9.
    runYtDlp.mockRejectedValueOnce(ytFailure(
      "Traceback (most recent call last):\n  File \"/usr/lib64/python3.9/runpy.py\", line 197\nImportError: yt-dlp requires Python 3.10+\n",
    ));
    const res = await get(`action=info&url=${encodeURIComponent(URL_OK)}`);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "generic" });
    const logged = loggerError.mock.calls[0][2];
    expect(logged).toBeInstanceOf(YtDlpError);
    expect((logged as Error).message).toContain("ImportError: yt-dlp requires Python 3.10+");
  });

  it("maps a bot wall to the friendly message", async () => {
    runYtDlp.mockRejectedValueOnce(ytFailure("ERROR: [youtube] x: Sign in to confirm you're not a bot\n"));
    const res = await get(`action=info&url=${encodeURIComponent(URL_OK)}`);
    expect(await res.json()).toEqual({ error: "blocked" });
  });

  it("rejects a link the tool doesn't accept without running yt-dlp", async () => {
    const res = await get("action=info&url=https://evil.example/x");
    expect(res.status).toBe(400);
    expect(runYtDlp).not.toHaveBeenCalled();
  });

  it("refuses to start a download from a GET", async () => {
    expect((await get(`url=${encodeURIComponent(URL_OK)}`)).status).toBe(405);
  });
});

describe("POST — the daily cap is spent only on a link that works", () => {
  it("a dead link does not use up a daily download", async () => {
    runYtDlp.mockRejectedValueOnce(ytFailure("ERROR: Video unavailable\n"));
    const res = await post({ url: URL_OK, quality: "720" });
    expect(res.status).toBe(502);
    expect(checkFreeToolDailyCap).not.toHaveBeenCalled();
    expect(chargeCredits).not.toHaveBeenCalled();
  });

  it("a too-long video does not use up a daily download", async () => {
    runYtDlp.mockResolvedValueOnce({ title: "long", duration: 3600 });
    const res = await post({ url: URL_OK });
    expect(res.status).toBe(400);
    expect(checkFreeToolDailyCap).not.toHaveBeenCalled();
  });

  it("over the cap → 429 and no job", async () => {
    runYtDlp.mockResolvedValueOnce({ title: "ok", duration: 30 });
    checkFreeToolDailyCap.mockResolvedValueOnce({ allowed: false, cap: 25 });
    const res = await post({ url: URL_OK });
    expect(res.status).toBe(429);
    expect(chargeCredits).not.toHaveBeenCalled();
  });

  it("a good link counts once, charges 0 and starts a job", async () => {
    runYtDlp.mockResolvedValueOnce({ title: "ok", duration: 30 }); // info
    runYtDlp.mockRejectedValueOnce(ytFailure("ERROR: stubbed download\n")); // the job itself
    const res = await post({ url: URL_OK, quality: "720", idempotencyKey: "k1" });
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ generationId: "g1" });
    expect(checkFreeToolDailyCap).toHaveBeenCalledTimes(1);
    expect(chargeCredits).toHaveBeenCalledWith(expect.objectContaining({ amount: 0, toolSlug: "youtube-downloader", idempotencyKey: "k1" }));
  });
});
