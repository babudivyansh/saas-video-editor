// yt-dlp follows redirects on its own, so the host allowlist only vets the
// first hop. Every yt-dlp call must therefore run with the generic extractor
// off — otherwise an open redirect on an allowed host is an SSRF primitive.

import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<{ url: string; flags: Record<string, unknown> }> = [];
vi.mock("youtube-dl-exec", () => ({
  create: () => async (url: string, flags: Record<string, unknown>) => {
    calls.push({ url, flags });
    if (flags.dumpSingleJson) return { title: "A video", duration: 30, is_live: false };
    throw new Error("download stubbed out");
  },
}));
vi.mock("@/utils/s3-upload", () => ({ uploadFileToS3: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/ensure-executable", () => ({ ensureExecutable: vi.fn() }));

const { importSourceFromUrl, isAllowedSourceUrl, probeSourceUrl, removeDownloadArtifacts } = await import("./url-import");

beforeEach(() => {
  calls.length = 0;
});

describe("url import", () => {
  it("probes with site extractors only", async () => {
    await probeSourceUrl("https://www.youtube.com/watch?v=abc");
    expect(calls[0].flags.useExtractors).toBe("default,-generic");
  });

  it("downloads with site extractors only", async () => {
    await expect(
      importSourceFromUrl({ url: "https://www.youtube.com/watch?v=abc", userId: "u1", projectId: "p1", tier: "pro" }),
    ).rejects.toThrow();
    const download = calls.find((c) => !c.flags.dumpSingleJson);
    expect(download?.flags.useExtractors).toBe("default,-generic");
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
