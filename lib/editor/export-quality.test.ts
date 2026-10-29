import { describe, expect, it } from "vitest";
import { checkExportQuality, exportFrame, isExportQuality, qualityScale, renderTimeoutMs, EXPORT_4K_MAX_SECONDS } from "./export-quality";

describe("export quality", () => {
  it("doubles every side for 4K and leaves 1080p alone", () => {
    expect(qualityScale("1080p")).toBe(1);
    expect(exportFrame({ w: 1080, h: 1920 }, "4k")).toEqual({ w: 2160, h: 3840 });
    expect(exportFrame({ w: 1920, h: 1080 }, "4k")).toEqual({ w: 3840, h: 2160 });
    expect(exportFrame({ w: 1080, h: 1350 }, "4k")).toEqual({ w: 2160, h: 2700 });
    expect(exportFrame({ w: 1080, h: 1920 }, "1080p")).toEqual({ w: 1080, h: 1920 });
  });

  it("gives 4K more time the longer the video", () => {
    expect(renderTimeoutMs(600, "1080p")).toBe(15 * 60_000);
    expect(renderTimeoutMs(60, "4k")).toBe(23 * 60_000);
    expect(renderTimeoutMs(EXPORT_4K_MAX_SECONDS, "4k")).toBe(55 * 60_000);
  });

  it("keeps 4K to Pro and Studio, and to videos up to the cap", () => {
    expect(checkExportQuality("1080p", "free", 99_999)).toBeNull();
    expect(checkExportQuality("4k", "free", 30)?.body.error).toBe("quality_locked");
    expect(checkExportQuality("4k", "creator", 30)?.status).toBe(403);
    expect(checkExportQuality("4k", "pro", 30)).toBeNull();
    expect(checkExportQuality("4k", "studio", EXPORT_4K_MAX_SECONDS)).toBeNull();
    expect(checkExportQuality("4k", "pro", EXPORT_4K_MAX_SECONDS + 1)?.body.error).toBe("quality_too_long");
  });

  it("knows its values", () => {
    expect(isExportQuality("4k")).toBe(true);
    expect(isExportQuality("8k")).toBe(false);
    expect(isExportQuality(undefined)).toBe(false);
  });
});
