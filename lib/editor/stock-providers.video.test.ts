import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { PEXELS_API_KEY: "test-key" } }));
vi.mock("@giphy/js-fetch-api", () => ({ GiphyFetch: class {} }));

const { searchStockVideos } = await import("./stock-providers");

const pexelsVideo = {
  id: 7, user: { name: "Ana" }, duration: 9, width: 1080, height: 1920, image: "https://images.pexels.com/x.jpg",
  video_files: [
    { link: "https://videos.pexels.com/hd.mp4", quality: "hd", height: 1920 },
    { link: "https://videos.pexels.com/sd.mp4", quality: "sd", height: 960 },
    { link: "https://videos.pexels.com/tiny.mp4", quality: "sd", height: 360 },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("searchStockVideos", () => {
  it("passes the orientation to Pexels and returns the smallest file as the preview", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ videos: [pexelsVideo] })));
    vi.stubGlobal("fetch", fetchMock);
    const [item] = await searchStockVideos("city", 2, "portrait");
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain("&page=2&orientation=portrait");
    expect(item.previewUrl).toBe("https://videos.pexels.com/tiny.mp4");
    expect(item.downloadUrl).toBe("https://videos.pexels.com/sd.mp4");
  });

  it("leaves orientation out when not asked", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ videos: [] })));
    vi.stubGlobal("fetch", fetchMock);
    await searchStockVideos("city");
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).not.toContain("orientation");
  });
});
