import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// The editor's server-side tools for the app: captions, AI text (one call
// for every caption at once), stock search/import, voices. The web routes
// they wrap are stand-ins here.

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1", email: "m@x.co", sessionId: "s1" })), convertToMobileSession: vi.fn(), verifyToken: vi.fn() }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
const web = { captions: vi.fn(), aiText: vi.fn(), search: vi.fn(), importStock: vi.fn(), voices: vi.fn() };
vi.mock("@/app/api/editor/captions/route", () => ({ POST: web.captions }));
vi.mock("@/app/api/editor/ai-text/route", () => ({ POST: web.aiText }));
vi.mock("@/app/api/editor/stock/search/route", () => ({ GET: web.search }));
vi.mock("@/app/api/editor/stock/import/route", () => ({ POST: web.importStock }));
vi.mock("@/app/api/voices/route", () => ({ GET: web.voices }));
vi.mock("@/lib/caption-templates", () => ({ planEmoji: vi.fn(() => []) }));
const getAsset = vi.fn(async (_u: string, id: string) => ({ id, name: "Ocean.mp4", kind: "video" }));
vi.mock("@/lib/mobile/assets", () => ({ getAsset }));

const captions = (await import("./captions/route")).POST;
const aiText = (await import("./ai-text/route")).POST;
const stock = (await import("./stock/route")).GET;
const importStock = (await import("./stock/import/route")).POST;
const voices = (await import("../voices/route")).GET;

const req = (path: string, method = "POST", body?: unknown) =>
  new NextRequest(`http://localhost/api/mobile/v1${path}`, { method, headers: { authorization: "Bearer acc", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const sent = async (m: ReturnType<typeof vi.fn>) => (m.mock.calls[0]![0] as NextRequest).json();

beforeEach(() => vi.clearAllMocks());

describe("captions", () => {
  it("returns the word timings and what it cost", async () => {
    web.captions.mockResolvedValue(NextResponse.json({ words: [{ word: "hi", start: 0, end: 300 }], minutesCharged: 2, minutesRemaining: 98 }));
    const res = await captions(req("/editor/captions", "POST", { assetId: "a1", languageCode: "en" }));
    expect(await res.json()).toEqual({ words: [{ word: "hi", start: 0, end: 300 }], minutesCharged: 2, minutesRemaining: 98 });
    expect(await sent(web.captions)).toEqual({ assetId: "a1", languageCode: "en" });
  });

  it("passes a minutes shortfall through with its numbers", async () => {
    web.captions.mockResolvedValue(NextResponse.json({ error: "Not enough Clip Minutes — needs 4, you have 1.", code: "insufficient_minutes", required: 4, balance: 1 }, { status: 402 }));
    const res = await captions(req("/editor/captions", "POST", { assetId: "a1" }));
    expect([res.status, await res.json()]).toEqual([402, { error: "Not enough Clip Minutes — needs 4, you have 1.", code: "insufficient_minutes", required: 4, balance: 1 }]);
  });
});

describe("ai-text", () => {
  it("runs the instant operations here, without the AI", async () => {
    const res = await aiText(req("/editor/ai-text", "POST", { operation: "fillerWords", texts: ["um so like this works", "uh yes"] }));
    const { texts } = await res.json();
    expect(texts).toHaveLength(2);
    expect(texts[0]).not.toMatch(/\bum\b/);
    expect(web.aiText).not.toHaveBeenCalled();
  });

  it("sends every caption in one call, a line each, and splits the answer back", async () => {
    web.aiText.mockResolvedValue(NextResponse.json({ result: "nadie te cuenta\nesta parte" }));
    const res = await aiText(req("/editor/ai-text", "POST", { operation: "translate", texts: ["nobody tells\nyou", "this part"], targetLang: "Spanish" }));
    expect(await res.json()).toEqual({ texts: ["nadie te cuenta", "esta parte"] });
    expect(web.aiText).toHaveBeenCalledOnce();
    expect(await sent(web.aiText)).toEqual({ operation: "translate", text: "nobody tells you\nthis part", targetLang: "Spanish" });
  });

  it("changes nothing if the lines don't come back one per caption", async () => {
    web.aiText.mockResolvedValue(NextResponse.json({ result: "all of it in one line" }));
    const res = await aiText(req("/editor/ai-text", "POST", { operation: "shorten", texts: ["one", "two"] }));
    expect([res.status, (await res.json()).code]).toEqual([422, "lines_mismatch"]);
  });

  it("passes the daily cap through", async () => {
    web.aiText.mockResolvedValue(NextResponse.json({ error: "You've used today's 20 free uses of this tool." }, { status: 429 }));
    expect((await aiText(req("/editor/ai-text", "POST", { operation: "rewrite", texts: ["x"] }))).status).toBe(429);
  });
});

describe("stock", () => {
  it("searches through the web route, and answers nothing for no query", async () => {
    web.search.mockResolvedValue(NextResponse.json({ items: [{ id: "p1", name: "Ocean", thumbUrl: "t", downloadUrl: "d", attribution: "Pexels" }] }));
    const res = await stock(req("/editor/stock?type=video&q=ocean&page=2", "GET"));
    expect((await res.json()).items).toHaveLength(1);
    expect(new URL((web.search.mock.calls[0]![0] as NextRequest).url).search).toBe("?type=video&q=ocean&page=2");
    expect(await (await stock(req("/editor/stock?type=video&q=", "GET"))).json()).toEqual({ items: [] });
    expect((await stock(req("/editor/stock?type=gif&q=cat", "GET"))).status).toBe(400);
  });

  it("imports a result into Assets and returns it in the app's shape", async () => {
    web.importStock.mockResolvedValue(NextResponse.json({ asset: { id: "a9" } }));
    const item = { id: "p1", name: "Ocean.mp4", thumbUrl: "t", downloadUrl: "https://videos.pexels.com/x.mp4", durationSec: 12, width: 1080, height: 1920, attribution: "Pexels" };
    const res = await importStock(req("/editor/stock/import", "POST", { type: "video", item }));
    expect([res.status, (await res.json()).id]).toEqual([201, "a9"]);
    expect(await sent(web.importStock)).toEqual({ downloadUrl: item.downloadUrl, kind: "video", name: "Ocean.mp4", durationSec: 12, width: 1080, height: 1920 });
    expect(getAsset).toHaveBeenCalledWith("u1", "a9");
  });
});

describe("voices", () => {
  it("lists the catalogue with the id a voiceover job takes", async () => {
    web.voices.mockResolvedValue(NextResponse.json({ configured: true, voices: [{ slug: "brian", label: "Brian", description: "Deep", gender: "male", accent: "American", previewUrl: "p.mp3", creditMultiplier: 1, languages: ["en"] }] }));
    expect(await (await voices(req("/voices", "GET"))).json()).toEqual({
      configured: true,
      voices: [{ id: "brian", name: "Brian", description: "Deep", gender: "male", accent: "American", previewUrl: "p.mp3", creditMultiplier: 1 }],
    });
  });
});
