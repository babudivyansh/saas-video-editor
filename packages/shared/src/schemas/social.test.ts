import { describe, expect, it } from "vitest";
import { captionLimit, createPostsRequest, isAutoPost, linkPostRequest, monthGrid, parseHashtags, updatePostRequest } from "./social";

const base = { source: { clipId: "c1" }, accountIds: ["a1"], caption: "hi", hashtags: [], when: "now" };

describe("social schemas", () => {
  it("builds a Monday-first month grid", () => {
    const oct = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(oct.slice(0, 4)).toEqual([null, null, null, 1]);
    expect(oct.filter(Boolean)).toHaveLength(31);
    expect(monthGrid(2026, 1).filter(Boolean)).toHaveLength(28);
  });

  it("normalises hashtags", () => {
    expect(parseHashtags("#Founders, startup  #founders ##podcast")).toEqual(["#founders", "#startup", "#podcast"]);
  });

  it("posts YouTube itself; Instagram and Facebook are the person's to post", () => {
    expect([isAutoPost("youtube"), isAutoPost("instagram"), isAutoPost("facebook")]).toEqual([true, false, false]);
    expect(captionLimit(["youtube"])).toBe(5000);
    expect(captionLimit(["youtube", "instagram"])).toBe(2200);
  });

  it("takes a clip or an Assets video, now or a time, with Public by default", () => {
    expect(createPostsRequest.parse(base).privacy).toBe("public");
    expect(createPostsRequest.safeParse({ ...base, source: { assetId: "a9" }, when: new Date().toISOString() }).success).toBe(true);
    expect(createPostsRequest.safeParse({ ...base, source: { clipId: "c1", assetId: "a9" } }).success).toBe(false);
    expect(createPostsRequest.safeParse({ ...base, when: "tomorrow" }).success).toBe(false);
    expect(createPostsRequest.safeParse({ ...base, accountIds: [] }).success).toBe(false);
  });

  it("limits caption length and hashtag shape", () => {
    expect(createPostsRequest.safeParse({ ...base, caption: "x".repeat(5001) }).success).toBe(false);
    expect(createPostsRequest.safeParse({ ...base, hashtags: ["#ok", "bad tag"] }).success).toBe(false);
    expect(createPostsRequest.safeParse({ ...base, hashtags: Array.from({ length: 31 }, (_, i) => `#t${i}`) }).success).toBe(false);
  });

  it("needs something to change, and a real link", () => {
    expect(updatePostRequest.safeParse({}).success).toBe(false);
    expect(updatePostRequest.safeParse({ caption: "new" }).success).toBe(true);
    expect(linkPostRequest.safeParse({ permalink: "javascript:alert(1)" }).success).toBe(false);
    expect(linkPostRequest.safeParse({ permalink: "https://www.instagram.com/reel/abc/" }).success).toBe(true);
  });
});
