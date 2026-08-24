// P0-3 regression coverage: AutoClip died on the first step because it reused
// a stored presigned URL long after its 6-hour signature expired
// (403 AccessDenied — "Request has expired"). The key is the durable part of
// that URL; only the signature rots. These tests pin key recovery across the
// URL shapes this codebase emits, and that a signature is never mistaken for
// part of the key.

import { describe, expect, it, vi, beforeEach } from "vitest";

const envMock = vi.hoisted(() => ({ value: {} as Record<string, string | undefined> }));
vi.mock("@/lib/env", () => ({ get env() { return envMock.value; } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
const getAssetReadUrl = vi.hoisted(() => vi.fn(async (key: string) => `https://signed.invalid/${key}?fresh=1`));
vi.mock("@/utils/s3-upload", () => ({ getAssetReadUrl }));

const { s3KeyFromStoredUrl, freshSourceUrl } = await import("./source-url");

const KEY = "uploads/user-1/abc-123.mp4";
const EXPIRED_QS =
  "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20260813T182724Z&X-Amz-Expires=21600&X-Amz-Signature=deadbeef";

beforeEach(() => {
  envMock.value = { AWS_S3_BUCKET: "saas-video-editor-assets" };
  getAssetReadUrl.mockClear();
});

describe("s3KeyFromStoredUrl", () => {
  it("recovers the key from a virtual-hosted S3 URL, ignoring an expired signature", () => {
    const url = `https://saas-video-editor-assets.s3.ap-south-1.amazonaws.com/${KEY}${EXPIRED_QS}`;
    expect(s3KeyFromStoredUrl(url)).toBe(KEY);
  });

  it("recovers the key from a path-style S3 URL", () => {
    const url = `https://s3.ap-south-1.amazonaws.com/saas-video-editor-assets/${KEY}${EXPIRED_QS}`;
    expect(s3KeyFromStoredUrl(url)).toBe(KEY);
  });

  it("recovers the key from a CDN URL when a CDN is configured", () => {
    envMock.value = { AWS_S3_BUCKET: "saas-video-editor-assets", CDN_BASE_URL: "https://cdn.clipiro.com" };
    expect(s3KeyFromStoredUrl(`https://cdn.clipiro.com/${KEY}`)).toBe(KEY);
  });

  it("decodes percent-encoded keys", () => {
    const url = "https://saas-video-editor-assets.s3.ap-south-1.amazonaws.com/uploads/user-1/my%20clip%20final.mp4";
    expect(s3KeyFromStoredUrl(url)).toBe("uploads/user-1/my clip final.mp4");
  });

  it("never lets the signature leak into the key", () => {
    const key = s3KeyFromStoredUrl(`https://saas-video-editor-assets.s3.ap-south-1.amazonaws.com/${KEY}${EXPIRED_QS}`);
    expect(key).not.toMatch(/X-Amz|Signature|deadbeef|\?/);
  });

  it("returns null for a foreign host rather than inventing a key", () => {
    expect(s3KeyFromStoredUrl(`https://evil.example.com/${KEY}`)).toBeNull();
  });

  it("returns null for a path-style URL belonging to a different bucket", () => {
    expect(s3KeyFromStoredUrl(`https://s3.ap-south-1.amazonaws.com/some-other-bucket/${KEY}`)).toBeNull();
  });

  it("returns null for malformed input and for a bare origin", () => {
    expect(s3KeyFromStoredUrl("not a url")).toBeNull();
    expect(s3KeyFromStoredUrl("https://saas-video-editor-assets.s3.ap-south-1.amazonaws.com/")).toBeNull();
  });
});

describe("freshSourceUrl", () => {
  it("re-mints from the recovered key instead of reusing the expired URL", async () => {
    const stored = `https://saas-video-editor-assets.s3.ap-south-1.amazonaws.com/${KEY}${EXPIRED_QS}`;
    const fresh = await freshSourceUrl(stored);
    expect(getAssetReadUrl).toHaveBeenCalledWith(KEY);
    expect(fresh).not.toBe(stored);
    expect(fresh).toContain("fresh=1");
  });

  it("falls back to the stored URL when no key can be recovered, rather than throwing", async () => {
    const stored = "https://third-party.example.com/video.mp4";
    await expect(freshSourceUrl(stored)).resolves.toBe(stored);
    expect(getAssetReadUrl).not.toHaveBeenCalled();
  });
});
