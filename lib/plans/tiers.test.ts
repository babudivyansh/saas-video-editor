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

describe("REVENUE_FLOOR_USD_PER_CREDIT — net of GST and gateway", async () => {
  const tiers = await import("./tiers");
  const { GST_RATE_PERCENT } = await import("@/lib/invoice/seller");

  it("uses the same GST rate the invoices charge", () => {
    expect(tiers.PRICING_GST_RATE_PERCENT).toBe(GST_RATE_PERCENT);
  });

  it("is the gross floor minus GST and the Razorpay fee ($0.0784)", () => {
    expect(tiers.REVENUE_FLOOR_USD_PER_CREDIT).toBe(0.0784);
    expect(tiers.REVENUE_FLOOR_USD_PER_CREDIT).toBeLessThan(tiers.REVENUE_FLOOR_GROSS_USD_PER_CREDIT);
  });
});

describe("2026-10-30 restructure", async () => {
  const tiers = await import("./tiers");
  const { billableCaptionMinutes } = await import("@/lib/autoclip-pricing");

  it("puts Lite between Free and Creator", () => {
    expect(tiers.TIER_ORDER).toEqual(["free", "lite", "creator", "pro", "studio"]);
    expect(tiers.tierAtLeast("lite", "creator")).toBe(false);
    expect(tiers.tierAtLeast("lite", "free")).toBe(true);
  });

  it("flags only INR renewals above RBI's ₹15,000 no-OTP limit", () => {
    expect(tiers.renewalNeedsApproval({ priceInPaise: 1_979_100 })).toBe(true); // Pro yearly
    expect(tiers.renewalNeedsApproval({ priceInPaise: 899_100 })).toBe(false); // Creator yearly
    expect(tiers.renewalNeedsApproval({ priceInPaise: 1_979_100, currency: "USD" })).toBe(false);
  });

  it("bills editor captions 1 Clip Minute per 2 minutes, at least 1", () => {
    expect(billableCaptionMinutes(30)).toBe(1);
    expect(billableCaptionMinutes(120)).toBe(1);
    expect(billableCaptionMinutes(121)).toBe(2);
    expect(billableCaptionMinutes(600)).toBe(5);
  });
});
