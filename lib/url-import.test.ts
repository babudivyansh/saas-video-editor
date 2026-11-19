// yt-dlp follows redirects on its own, so the host allowlist only vets the
// first hop. Every yt-dlp call must therefore run with the generic extractor
// off — otherwise an open redirect on an allowed host is an SSRF primitive.

import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<{ url: string; flags: Record<string, unknown> }> = [];
/** Per download attempt: true writes the output file, false fails like prod. */
let downloadPlan: boolean[] = [];
vi.mock("youtube-dl-exec", () => ({
  create: () => async (url: string, flags: Record<string, unknown>) => {
    calls.push({ url, flags });
    if (flags.dumpSingleJson) return { title: "A video", duration: 30, is_live: false };
    if (downloadPlan.shift()) {
      const fs = await import("fs");
      fs.writeFileSync(String(flags.output), "video");
      return "";
    }
    throw Object.assign(new Error("download stubbed out"), { stderr: "ERROR: Did not get any data blocks" });
  },
}));
vi.mock("@/utils/s3-upload", () => ({ uploadFileToS3: vi.fn(async () => "https://s3/stored.mp4") }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/ensure-executable", () => ({ ensureExecutable: vi.fn() }));

const { importSourceFromUrl, isAllowedSourceUrl, probeSourceUrl, removeDownloadArtifacts } = await import("./url-import");

beforeEach(() => {
  calls.length = 0;
  downloadPlan = [];
  vi.useRealTimers();
});

/** Runs an import with the retry delays skipped. */
async function runImport() {
  vi.useFakeTimers();
  const p = importSourceFromUrl({ url: "https://www.youtube.com/watch?v=abc", userId: "u1", projectId: "p1", tier: "pro" });
  p.catch(() => {}); // asserted below; keeps the rejection handled while timers run
  await vi.runAllTimersAsync();
  return p;
}

const downloads = () => calls.filter((c) => !c.flags.dumpSingleJson);

describe("url import", () => {
  it("probes with site extractors only", async () => {
    await probeSourceUrl("https://www.youtube.com/watch?v=abc");
    expect(calls[0].flags.useExtractors).toBe("default,-generic");
  });

  it("downloads with site extractors only, on every attempt", async () => {
    await expect(runImport()).rejects.toThrow("We couldn't download that video");
    expect(downloads()).toHaveLength(3);
    for (const d of downloads()) expect(d.flags.useExtractors).toBe("default,-generic");
  });

  // CLIPIRO-WEB-T / WEB-1M: YouTube served an empty body for the web formats.
  it("retries, and asks the mobile-web client last", async () => {
    downloadPlan = [false, false, true];
    const result = await runImport();
    expect(result.url).toBe("https://s3/stored.mp4");
    const [first, second, third] = downloads();
    expect(first.flags.extractorArgs).toBeUndefined();
    expect(second.flags.extractorArgs).toBeUndefined();
    expect(third.flags.extractorArgs).toBe("youtube:player_client=mweb");
    expect(third.flags.maxFilesize).toBe(first.flags.maxFilesize);
  });

  it("stops after the first attempt that works", async () => {
    downloadPlan = [true];
    await runImport();
    expect(downloads()).toHaveLength(1);
  });

  it("allowlists hosts on the first hop", () => {
    expect(isAllowedSourceUrl("https://youtu.be/abc")).toBe(true);
    expect(isAllowedSourceUrl("http://youtu.be/abc")).toBe(false);
    expect(isAllowedSourceUrl("https://169.254.169.254/latest/meta-data")).toBe(false);
  });
});


// Hostinger disk, 2026-11-19: a failed import left yt-dlp's per-format files
// (one was a 2 GB `.f399.mp4.part`) because only the merged name was deleted.
describe("removeDownloadArtifacts", () => {
  it("deletes the download and every yt-dlp sidecar, nothing else", async () => {
    const fs = await import("fs");
    const os = await import("os");
    const path = await import("path");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "url-import-artifacts-"));
    try {
      const stem = "import-p1-0f8fad5b-d9cb-469f-a165-70867728950e";
      const ours = [`${stem}.mp4`, `${stem}.f399.mp4.part`, `${stem}.f140.m4a`, `${stem}.temp.mp4`, `${stem}.mp4.ytdl`];
      const others = ["import-p1-other.mp4", `${stem}x.mp4`];
      for (const n of [...ours, ...others]) fs.writeFileSync(path.join(dir, n), "x");
      removeDownloadArtifacts(path.join(dir, `${stem}.mp4`));
      expect(fs.readdirSync(dir).sort()).toEqual([...others].sort());
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
