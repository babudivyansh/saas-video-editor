import { describe, it, expect } from "vitest";
import { downloadHref } from "./download-file";

describe("downloadHref", () => {
  it("routes cross-origin media through the attachment redirect", () => {
    const src = "https://b.s3.ap-south-1.amazonaws.com/renders/p.mp4?X-Amz-Signature=abc&X-Amz-Date=1";
    const href = downloadHref(src, "my clip.mp4");
    expect(href.startsWith("/api/media/download?")).toBe(true);
    const qs = new URLSearchParams(href.split("?")[1]);
    expect(qs.get("src")).toBe(src);
    expect(qs.get("name")).toBe("my clip.mp4");
  });

  it("leaves same-origin, blob and data URLs alone", () => {
    expect(downloadHref("/api/projects/1/clips/2/download", "a.mp4")).toBe("/api/projects/1/clips/2/download");
    expect(downloadHref("blob:https://clipiro.com/x")).toBe("blob:https://clipiro.com/x");
    expect(downloadHref("data:text/plain,hi")).toBe("data:text/plain,hi");
    expect(downloadHref("//evil.example/x").startsWith("/api/media/download?")).toBe(true);
  });
});
