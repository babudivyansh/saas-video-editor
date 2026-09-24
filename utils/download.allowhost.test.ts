// @vitest-environment node
//
// downloadFile's allowHost: the guard for URLs a CLIENT supplied.
//
// Checking only the URL you were handed is not enough. An allowed host that
// answers with a redirect to 169.254.169.254 (cloud metadata) or an internal
// service would still be followed, so the predicate has to run on every hop.
import { beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import path from "path";

type Handler = (res: { statusCode: number; headers: Record<string, string> }) => void;
const requested: string[] = [];
/** What each requested URL answers with: a redirect Location, or null for "don't care". */
let redirects: Record<string, string> = {};

function fakeGet(url: string, cb: Handler) {
  requested.push(url);
  const location = redirects[url];
  queueMicrotask(() => cb({ statusCode: location ? 302 : 500, headers: location ? { location } : {} }));
  return { setTimeout: () => {}, on: () => {}, destroy: () => {} };
}
vi.mock("https", () => ({ default: { get: fakeGet }, get: fakeGet }));
vi.mock("http", () => ({ default: { get: fakeGet }, get: fakeGet }));

const { downloadFile } = await import("./download");
const { isAllowedStockHost, isAllowedStockUrl } = await import("@/lib/stock-hosts");

const dest = () => path.join(os.tmpdir(), `allowhost-test-${Math.random().toString(36).slice(2)}.bin`);
const audioOnly = { allowHost: (h: string) => isAllowedStockHost(h, "audio") };

beforeEach(() => {
  requested.length = 0;
  redirects = {};
});

describe("downloadFile allowHost", () => {
  it("refuses a host outside the list without making any request", async () => {
    await expect(downloadFile("https://169.254.169.254/latest/meta-data/", dest(), 1000, audioOnly))
      .rejects.toThrow(/not an allowed source/);
    expect(requested).toEqual([]);
  });

  it("refuses plain http even on an allowed host", async () => {
    await expect(downloadFile("http://prod.jamendo.com/track.mp3", dest(), 1000, audioOnly))
      .rejects.toThrow(/not an allowed source/);
    expect(requested).toEqual([]);
  });

  it("refuses a REDIRECT from an allowed host to an internal one", async () => {
    redirects["https://prod.jamendo.com/track.mp3"] = "https://10.0.0.5/admin";
    await expect(downloadFile("https://prod.jamendo.com/track.mp3", dest(), 1000, audioOnly))
      .rejects.toThrow(/not an allowed source/);
    expect(requested).toEqual(["https://prod.jamendo.com/track.mp3"]);
  });

  it("follows a redirect that stays on allowed hosts, resolving a relative Location", async () => {
    redirects["https://prod.jamendo.com/track.mp3"] = "/download/track.mp3";
    await expect(downloadFile("https://prod.jamendo.com/track.mp3", dest(), 1000, audioOnly)).rejects.toThrow(/HTTP 500/);
    expect(requested).toEqual(["https://prod.jamendo.com/track.mp3", "https://prod.jamendo.com/download/track.mp3"]);
  });
});

describe("stock host allowlist", () => {
  it.each([
    ["https://prod-1.storage.jamendo.com/download/t.mp3", "audio", true],
    ["https://videos.pexels.com/v.mp4", "audio", false],
    ["https://videos.pexels.com/v.mp4", "video", true],
    ["https://jamendo.com.evil.example/t.mp3", "audio", false],
    ["http://prod.jamendo.com/t.mp3", "audio", false],
    ["not a url", "any", false],
  ] as const)("%s as %s → %s", (url, kind, ok) => {
    expect(isAllowedStockUrl(url, kind)).toBe(ok);
  });
});
