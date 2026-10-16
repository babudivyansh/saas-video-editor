import { describe, expect, it } from "vitest";
import { instagramUrl, instagramFriendlyError, youtubeUrl, youtubeFriendlyError } from "./downloader-urls";

describe("youtubeUrl", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?t=10", "dQw4w9WgXcQ"],
    ["https://youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("canonicalises %s", (raw, id) => {
    expect(youtubeUrl(raw)).toBe(`https://www.youtube.com/watch?v=${id}`);
  });

  it.each([
    "https://example.com/watch?v=dQw4w9WgXcQx", // 12 chars
    "https://youtu.be/../../etc/passwd",
    "https://www.youtube.com/watch?v=abc%20--exec",
    "not a url",
  ])("rejects %s", (raw) => {
    expect(youtubeUrl(raw)).toBeNull();
  });
});

describe("instagramUrl", () => {
  it("accepts public post, reel and IGTV links and strips the query", () => {
    expect(instagramUrl("https://www.instagram.com/reel/Cabc123_-/?igsh=x")).toBe("https://www.instagram.com/reel/Cabc123_-/");
    expect(instagramUrl("https://instagram.com/p/Cabc123/")).toBe("https://www.instagram.com/p/Cabc123/");
    expect(instagramUrl("https://www.instagram.com/someuser/reel/Cabc123")).toBe("https://www.instagram.com/someuser/reel/Cabc123");
  });

  it.each([
    "https://instagram.com.evil.example/reel/abc",
    "https://evil.example/instagram.com/reel/abc",
    "file:///etc/passwd",
    "https://www.instagram.com/stories/someone/123",
    "https://www.instagram.com/",
  ])("rejects %s", (raw) => {
    expect(instagramUrl(raw)).toBeNull();
  });
});

describe("friendly errors never echo yt-dlp's text", () => {
  const raw = "ERROR: [youtube] abc: Unable to extract; /tmp/ytdl_123.mp4 python traceback";
  it("youtube", () => expect(youtubeFriendlyError(raw)).not.toContain("/tmp"));
  it("instagram", () => expect(instagramFriendlyError(raw)).not.toContain("/tmp"));
});
