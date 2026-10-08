import { DEFAULT_AUTOCLIP_SETTINGS } from "@clipiro/shared";
import { installFakeApi, videoAssetFixture } from "@/test/fakeApi";
import { beginUpload, sendParts, UploadRefused, type SavedUpload, type UploadIO } from "../upload";
import { setUploadIO, useAutoClipUpload } from "../uploadStore";

// The multipart upload against a fake API and a fake file layer: parts sent
// in order with their ETags, progress, resume from the saved state, an
// expired part URL signed again, refusals, cancel, and the run started after.

const MB = 1024 * 1024;
const FILE = { uri: "file:///cache/ep42.mp4", name: "ep42.mp4", mimeType: "video/mp4", sizeBytes: 25 * MB, durationSec: 600 };
const RUN = { settings: DEFAULT_AUTOCLIP_SETTINGS };

function fakeIO(o: { failAt?: number; statusFor?: (part: number, attempt: number) => number } = {}) {
  let saved: SavedUpload | null = null;
  const puts: { part: number; url: string }[] = [];
  const attempts = new Map<number, number>();
  const io: UploadIO & { puts: typeof puts; current: () => SavedUpload | null } = {
    puts,
    current: () => saved,
    readPart: async (_uri, offset, length) => `part@${offset}+${length}`,
    putPart: async (partUri, url, onBytes) => {
      const part = Number(new URL(url).searchParams.get("partNumber"));
      if (o.failAt === part) throw new Error("Network request failed");
      const attempt = (attempts.get(part) ?? 0) + 1;
      attempts.set(part, attempt);
      puts.push({ part, url });
      onBytes(Number(partUri.split("+")[1]) / 2);
      const status = o.statusFor?.(part, attempt) ?? 200;
      return { status, etag: status === 200 ? `"etag-${part}"` : null };
    },
    fileExists: () => true,
    load: async () => (saved ? JSON.parse(JSON.stringify(saved)) : null),
    save: async (s) => {
      saved = s ? JSON.parse(JSON.stringify(s)) : null;
    },
  };
  return io;
}

const signed = (n: number, v = 1) => ({ partNumber: n, url: `https://s3.test/up?partNumber=${n}&v=${v}` });
function api() {
  return installFakeApi({
    "POST /uploads": () => [200, { key: "uploads/u1/ep42.mp4", uploadId: "up-1", partSizeBytes: 10 * MB, parts: [1, 2, 3].map((n) => signed(n)) }],
    "POST /uploads/part-urls": (b) => [200, { parts: (b.partNumbers as number[]).map((n) => signed(n, 2)) }],
    "POST /uploads/complete": () => [200, videoAssetFixture({ id: "ast_new", name: "ep42.mp4", durationSec: 600 })],
    "POST /uploads/abort": () => [200, { ok: true }],
    "POST /jobs": () => [202, { jobId: "run_p9" }],
  });
}

let server: ReturnType<typeof api>;
beforeEach(() => {
  server = api();
  useAutoClipUpload.setState({ status: "idle", fileName: null, progress: 0, error: null, jobId: null, asset: null, refusal: null, saved: null });
});
afterEach(() => server.restore());

describe("upload engine", () => {
  it("sends every part and completes with their ETags, in order", async () => {
    const io = fakeIO();
    const progress: number[] = [];
    const { saved, urls } = await beginUpload(io, FILE, RUN);
    const asset = await sendParts(io, saved, urls, { signal: new AbortController().signal, onProgress: (f) => progress.push(f) });
    expect(asset.id).toBe("ast_new");
    expect(io.puts.map((p) => p.part)).toEqual([1, 2, 3]);
    expect(server.to("POST", "/uploads")[0]!.body).toEqual({ name: "ep42.mp4", mimeType: "video/mp4", sizeBytes: 25 * MB });
    expect(server.to("POST", "/uploads/complete")[0]!.body).toMatchObject({
      key: "uploads/u1/ep42.mp4",
      uploadId: "up-1",
      parts: [
        { partNumber: 1, etag: '"etag-1"' },
        { partNumber: 2, etag: '"etag-2"' },
        { partNumber: 3, etag: '"etag-3"' },
      ],
      // The phone knew the length: the server checks minutes before the run.
      durationSec: 600,
    });
    // The last part is the 5 MB remainder; progress only climbs, to 1.
    expect(progress.at(-1)).toBe(1);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(io.current()).toBeNull();
  });

  it("resumes from the saved parts, signing fresh URLs for the rest", async () => {
    const io = fakeIO({ failAt: 3 });
    const { saved, urls } = await beginUpload(io, FILE, RUN);
    await expect(sendParts(io, saved, urls, { signal: new AbortController().signal })).rejects.toThrow("Network request failed");
    expect(Object.keys(io.current()!.etags)).toEqual(["1", "2"]);

    const io2 = fakeIO();
    await io2.save(io.current());
    const asset = await sendParts(io2, (await io2.load())!, new Map(), { signal: new AbortController().signal });
    expect(asset.id).toBe("ast_new");
    expect(io2.puts.map((p) => p.part)).toEqual([3]);
    expect(server.to("POST", "/uploads/part-urls")[0]!.body).toMatchObject({ partNumbers: [3] });
    expect(server.to("POST", "/uploads/complete")[0]!.body.parts).toHaveLength(3);
  });

  it("signs a part again when its URL has expired", async () => {
    const io = fakeIO({ statusFor: (part, attempt) => (part === 2 && attempt === 1 ? 403 : 200) });
    const { saved, urls } = await beginUpload(io, FILE, RUN);
    await sendParts(io, saved, urls, { signal: new AbortController().signal });
    expect(io.puts.filter((p) => p.part === 2).map((p) => new URL(p.url).searchParams.get("v"))).toEqual(["1", "2"]);
  });

  it("gives up when storage refuses a part", async () => {
    const io = fakeIO({ statusFor: (part) => (part === 2 ? 500 : 200) });
    const { saved, urls } = await beginUpload(io, FILE, RUN);
    await expect(sendParts(io, saved, urls, { signal: new AbortController().signal })).rejects.toBeInstanceOf(UploadRefused);
  });
});

describe("upload store", () => {
  it("uploads, then starts the run from the new Asset", async () => {
    setUploadIO(fakeIO());
    await useAutoClipUpload.getState().upload(FILE, { settings: DEFAULT_AUTOCLIP_SETTINGS, allowCreditOverflow: true });
    expect(useAutoClipUpload.getState()).toMatchObject({ status: "started", jobId: "run_p9", progress: 1 });
    expect(server.to("POST", "/jobs")[0]!.body).toMatchObject({ type: "autoclip", source: { kind: "asset", assetId: "ast_new" }, allowCreditOverflow: true });
  });

  it("pauses on a lost connection and resumes later, from disk", async () => {
    const io = fakeIO({ failAt: 2 });
    setUploadIO(io);
    await useAutoClipUpload.getState().upload(FILE, RUN);
    expect(useAutoClipUpload.getState()).toMatchObject({ status: "paused" });
    expect(useAutoClipUpload.getState().progress).toBeCloseTo(0.4);

    // The app is killed: a fresh store reads the upload back.
    const io2 = fakeIO();
    await io2.save(io.current());
    setUploadIO(io2);
    useAutoClipUpload.setState({ status: "idle", saved: null });
    await useAutoClipUpload.getState().hydrate();
    expect(useAutoClipUpload.getState()).toMatchObject({ status: "paused", fileName: "ep42.mp4" });
    await useAutoClipUpload.getState().resume();
    expect(useAutoClipUpload.getState()).toMatchObject({ status: "started", jobId: "run_p9" });
    expect(io2.puts.map((p) => p.part)).toEqual([2, 3]);
  });

  it("keeps the uploaded video when the run is refused for minutes", async () => {
    setUploadIO(fakeIO());
    server.restore();
    server = installFakeApi({
      "POST /uploads": () => [200, { key: "k", uploadId: "u", partSizeBytes: 10 * MB, parts: [1, 2, 3].map((n) => signed(n)) }],
      "POST /uploads/complete": () => [200, videoAssetFixture({ id: "ast_new" })],
      "POST /jobs": () => [402, { error: "This video needs 45 Clip Minutes and you have 30.", code: "insufficient_minutes", required: 45, balance: 30, overflowCredits: 5 }],
    });
    await useAutoClipUpload.getState().upload(FILE, RUN);
    expect(useAutoClipUpload.getState()).toMatchObject({
      status: "short",
      asset: { id: "ast_new" },
      refusal: { message: "This video needs 45 Clip Minutes and you have 30.", required: 45, balance: 30, overflowCredits: 5 },
    });
  });

  it("cancel stops the upload and tells storage to drop the parts", async () => {
    const io = fakeIO({ failAt: 2 });
    setUploadIO(io);
    await useAutoClipUpload.getState().upload(FILE, RUN);
    await useAutoClipUpload.getState().cancel();
    expect(useAutoClipUpload.getState().status).toBe("idle");
    expect(server.to("POST", "/uploads/abort")[0]!.body).toEqual({ key: "uploads/u1/ep42.mp4", uploadId: "up-1" });
    expect(io.current()).toBeNull();
  });
});
