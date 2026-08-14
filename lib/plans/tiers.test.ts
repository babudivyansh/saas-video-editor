import { describe, expect, it } from "vitest";
import {
  maxUploadBytesForTier,
  MAX_UPLOAD_BYTES_BY_TIER,
  storageLimitBytesForTier,
  formatBytes,
  ALLOWED_UPLOAD_MIME,
  TIER_ORDER,
} from "./tiers";

describe("maxUploadBytesForTier — single source of truth for the per-file cap", () => {
  it("is strictly increasing across the tier order", () => {
    const bytes = TIER_ORDER.map((t) => maxUploadBytesForTier(t));
    for (let i = 1; i < bytes.length; i++) {
      expect(bytes[i]).toBeGreaterThan(bytes[i - 1]);
    }
  });

  it("matches the documented per-tier map exactly", () => {
    expect(maxUploadBytesForTier("free")).toBe(MAX_UPLOAD_BYTES_BY_TIER.free);
    expect(maxUploadBytesForTier("creator")).toBe(MAX_UPLOAD_BYTES_BY_TIER.creator);
    expect(maxUploadBytesForTier("pro")).toBe(MAX_UPLOAD_BYTES_BY_TIER.pro);
    expect(maxUploadBytesForTier("studio")).toBe(MAX_UPLOAD_BYTES_BY_TIER.studio);
  });

  it("never exceeds the tier's cumulative storage quota (a single file can't itself violate the quota's own ceiling)", () => {
    for (const t of TIER_ORDER) {
      expect(maxUploadBytesForTier(t)).toBeLessThanOrEqual(storageLimitBytesForTier(t));
    }
  });
});

describe("formatBytes", () => {
  it("renders MB below 1 GB and GB at/above it", () => {
    expect(formatBytes(850 * 1024 ** 2)).toBe("850 MB");
    expect(formatBytes(1 * 1024 ** 3)).toBe("1 GB");
    expect(formatBytes(2.5 * 1024 ** 3)).toBe("2.5 GB");
  });
});

describe("ALLOWED_UPLOAD_MIME", () => {
  it("accepts the documented video/audio/image formats", () => {
    for (const mime of ["video/mp4", "video/webm", "audio/mpeg", "audio/wav", "image/png", "image/webp"]) {
      expect(ALLOWED_UPLOAD_MIME.test(mime)).toBe(true);
    }
  });

  it("rejects a spoofed/unsupported MIME type", () => {
    for (const mime of ["text/html", "application/javascript", "image/svg+xml"]) {
      expect(ALLOWED_UPLOAD_MIME.test(mime)).toBe(false);
    }
  });
});
