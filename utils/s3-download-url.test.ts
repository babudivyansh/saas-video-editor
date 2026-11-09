import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    AWS_REGION: "ap-south-1",
    AWS_ACCESS_KEY_ID: "AKIATESTTESTTEST",
    AWS_SECRET_ACCESS_KEY: "secretsecretsecretsecretsecret",
    AWS_S3_BUCKET: "clipiro-test",
  },
}));

import { getPresignedUrl, getPresignedDownloadUrl, verifyPresignedReadUrl } from "./s3-upload";

afterEach(() => vi.useRealTimers());

describe("verifyPresignedReadUrl", () => {
  it("accepts a URL we presigned and returns its key", async () => {
    const url = await getPresignedUrl("renders/p1/clip 1.mp4", 600);
    expect(await verifyPresignedReadUrl(url)).toBe("renders/p1/clip 1.mp4");
  });

  it("rejects a tampered key or signature", async () => {
    const url = await getPresignedUrl("renders/p1.mp4", 600);
    expect(await verifyPresignedReadUrl(url.replace("renders/p1.mp4", "renders/p2.mp4"))).toBeNull();
    const u = new URL(url);
    u.searchParams.set("X-Amz-Signature", "0".repeat(64));
    expect(await verifyPresignedReadUrl(u.toString())).toBeNull();
    u.searchParams.delete("X-Amz-Signature");
    expect(await verifyPresignedReadUrl(u.toString())).toBeNull();
  });

  it("rejects an expired URL", async () => {
    const url = await getPresignedUrl("renders/p1.mp4", 60);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 2 * 3600 * 1000);
    expect(await verifyPresignedReadUrl(url)).toBeNull();
  });

  it("rejects other buckets, hosts and unsigned URLs", async () => {
    const url = await getPresignedUrl("renders/p1.mp4", 600);
    expect(await verifyPresignedReadUrl(url.replace("clipiro-test.s3", "other-bucket.s3"))).toBeNull();
    expect(await verifyPresignedReadUrl(url.replace("https://clipiro-test.s3.ap-south-1.amazonaws.com", "https://evil.example"))).toBeNull();
    expect(await verifyPresignedReadUrl("https://clipiro-test.s3.ap-south-1.amazonaws.com/renders/p1.mp4")).toBeNull();
    expect(await verifyPresignedReadUrl("not a url")).toBeNull();
  });
});

describe("getPresignedDownloadUrl", () => {
  it("signs an attachment disposition into the URL", async () => {
    const url = new URL(await getPresignedDownloadUrl("renders/p1.mp4", 'attachment; filename="a.mp4"'));
    expect(url.searchParams.get("response-content-disposition")).toBe('attachment; filename="a.mp4"');
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
  });
});
