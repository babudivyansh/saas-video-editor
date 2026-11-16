import { describe, expect, it } from "vitest";
import { instagramUrl, instagramFriendlyError, instagramLinkFailure, youtubeUrl, youtubeFriendlyError, youtubeLinkFailure } from "./downloader-urls";

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

describe("link-caused failures (logged as warnings, not errors)", () => {
  it("treats a private / login-gated Instagram post as the link's problem (CLIPIRO-WEB-R)", () => {
    expect(instagramLinkFailure("[Instagram] DfzEPEno90f: Instagram sent an empty media response. Check if this post is accessible in your browser without being logged-in.")).toBe(true);
    expect(instagramLinkFailure("[Instagram] abc: Requested content is not available, rate-limit reached or login required")).toBe(true);
    expect(instagramLinkFailure("spawn /x/yt-dlp_linux EAGAIN")).toBe(false);
  });

  it("keeps YouTube's bot wall an error: that blocks every user", () => {
    expect(youtubeLinkFailure("[youtube] abc: Sign in to confirm you're not a bot")).toBe(false);
    expect(youtubeLinkFailure("[youtube] abc: Private video. Sign in if you've been granted access to this video")).toBe(true);
    expect(youtubeLinkFailure("[youtube] abc: Video unavailable. This video has been removed by the uploader")).toBe(true);
    expect(youtubeLinkFailure("ImportError: needs 3.10")).toBe(false);
  });
});
