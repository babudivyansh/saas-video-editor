// The media bucket is private (docs/ops/s3-private-bucket.md): a stored
// unsigned URL is a 403, so every reader needs a presigned one. These pin which
// URLs get signed and — just as important — which never do.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { AWS_S3_BUCKET: "media-bucket" } }));
const getAssetReadUrl = vi.hoisted(() => vi.fn(async (key: string, ttl?: number) => `https://signed.invalid/${key}?ttl=${ttl ?? "default"}`));
vi.mock("@/utils/s3-upload", () => ({ getAssetReadUrl }));

const { ownBucketKey, resignMediaUrl, fetchableMediaUrl } = await import("./signed-media");

const OURS = "https://media-bucket.s3.ap-south-1.amazonaws.com/renders/p1/clip-0.mp4";
const OTHER_BUCKET = "https://someone-else.s3.ap-south-1.amazonaws.com/renders/p1/clip-0.mp4";
const EXTERNAL = "https://videos.pexels.com/v/1.mp4";

beforeEach(() => getAssetReadUrl.mockClear());

describe("ownBucketKey", () => {
  it("recovers the key of one of our URLs, ignoring an old signature", () => {
    expect(ownBucketKey(`${OURS}?X-Amz-Signature=dead`)).toBe("renders/p1/clip-0.mp4");
  });

  it("refuses another bucket, a third-party host and junk", () => {
    expect(ownBucketKey(OTHER_BUCKET)).toBeNull();
    expect(ownBucketKey(EXTERNAL)).toBeNull();
    expect(ownBucketKey("not a url")).toBeNull();
    expect(ownBucketKey(null)).toBeNull();
  });
});

describe("resignMediaUrl", () => {
  it("signs our bucket's URLs", async () => {
    expect(await resignMediaUrl(OURS)).toBe("https://signed.invalid/renders/p1/clip-0.mp4?ttl=default");
  });

  it("never signs another bucket's key against ours", async () => {
    expect(await resignMediaUrl(OTHER_BUCKET)).toBe(OTHER_BUCKET);
    expect(getAssetReadUrl).not.toHaveBeenCalled();
  });

  it("passes third-party URLs and null through", async () => {
    expect(await resignMediaUrl(EXTERNAL)).toBe(EXTERNAL);
    expect(await resignMediaUrl(null)).toBeNull();
  });

  it("falls back to the stored URL when signing fails", async () => {
    getAssetReadUrl.mockRejectedValueOnce(new Error("no creds"));
    expect(await resignMediaUrl(OURS)).toBe(OURS);
  });
});

describe("fetchableMediaUrl (server-side fetches)", () => {
  it("presigns our URLs with the asked-for lifetime", async () => {
    expect(await fetchableMediaUrl(OURS, 600)).toBe("https://signed.invalid/renders/p1/clip-0.mp4?ttl=600");
  });

  it("leaves URLs it cannot sign alone", async () => {
    expect(await fetchableMediaUrl(EXTERNAL)).toBe(EXTERNAL);
    expect(await fetchableMediaUrl(OTHER_BUCKET)).toBe(OTHER_BUCKET);
  });
});
