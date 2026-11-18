import { describe, expect, it } from "vitest";
import { sourceDurationError, sourceFileError, sourceLimitsHint } from "./autoclip-source";
import { MAX_UPLOAD_BYTES_BY_TIER, TIER_MAX_AUTOCLIP_SOURCE_SECONDS, type TierId } from "@/lib/plans/tiers";

const TIERS: TierId[] = ["free", "lite", "creator", "pro", "studio"];
const mp4 = (size: number) => ({ type: "video/mp4", name: "stream.mp4", size });

describe("sourceFileError", () => {
  it("allows a file right at each plan's size limit and refuses one byte over", () => {
    for (const tier of TIERS) {
      const max = MAX_UPLOAD_BYTES_BY_TIER[tier];
      expect(sourceFileError(mp4(max), tier), tier).toBeNull();
      expect(sourceFileError(mp4(max + 1), tier), tier).toMatch(/plan's limit/);
    }
  });

  // The old flat 500 MB cap blocked paid plans from what they pay for.
  it("lets a Studio user pick a 3 GB stream recording", () => {
    expect(sourceFileError(mp4(3 * 1024 ** 3), "studio")).toBeNull();
  });

  it("names the plan and its limit", () => {
    expect(sourceFileError(mp4(300 * 1024 ** 2), "free")).toBe(
      "That video is over 250 MB, the Free plan's limit. Trim or compress it, or upgrade for larger files.",
    );
    expect(sourceFileError(mp4(2 * 1024 ** 3), "creator")).toMatch(/over 1 GB, the Creator plan's limit/);
  });

  it("defers to the server while the plan is unknown", () => {
    expect(sourceFileError(mp4(3 * 1024 ** 3), undefined)).toBeNull();
  });

  it("still refuses a file that isn't a video", () => {
    expect(sourceFileError({ type: "application/pdf", name: "notes.pdf", size: 10 }, "studio")).toMatch(/MP4, MOV or WebM/);
    expect(sourceFileError({ type: "", name: "clip.MOV", size: 10 }, "free")).toBeNull();
  });
});

describe("sourceDurationError", () => {
  it("allows each plan's full length and refuses a second over", () => {
    for (const tier of TIERS) {
      const max = TIER_MAX_AUTOCLIP_SOURCE_SECONDS[tier];
      expect(sourceDurationError(max, tier), tier).toBeNull();
      expect(sourceDurationError(max + 1, tier), tier).toMatch(/plan's limit/);
    }
  });

  // The old flat 90-minute cap: a 3-hour stream on Pro (4 h) was refused.
  it("lets a Pro user pick a 3-hour stream", () => {
    expect(sourceDurationError(3 * 3600, "pro")).toBeNull();
  });

  it("formats the limit as the plan page does", () => {
    expect(sourceDurationError(31 * 60, "free")).toMatch(/over 30 min, the Free plan's limit/);
    expect(sourceDurationError(5 * 3600, "pro")).toMatch(/over 4 h, the Pro plan's limit/);
  });

  it("refuses under a minute on every plan, and ignores an unknown length", () => {
    expect(sourceDurationError(30, "studio")).toMatch(/under a minute/);
    expect(sourceDurationError(null, "free")).toBeNull();
    expect(sourceDurationError(Number.NaN, "free")).toBeNull();
  });
});

describe("sourceLimitsHint", () => {
  it("shows the plan's own limits, not the old flat 500 MB / 1 h 30 m", () => {
    expect(sourceLimitsHint("free")).toBe("MP4, MOV or WebM · up to 250 MB · 1 min to 30 min");
    expect(sourceLimitsHint("pro")).toBe("MP4, MOV or WebM · up to 2 GB · 1 min to 4 h");
    expect(sourceLimitsHint("studio")).toBe("MP4, MOV or WebM · up to 5 GB · 1 min to 6 h");
  });
});
