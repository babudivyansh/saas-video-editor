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

const { importSourceFromUrl, isAllowedSourceUrl, probeSourceUrl } = await import("./url-import");

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
