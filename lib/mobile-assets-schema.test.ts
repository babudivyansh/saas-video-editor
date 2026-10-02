import { describe, expect, it } from "vitest";
import { ARCHIVE_RETENTION_DAYS, STORAGE_LIMIT_GB, assetUploadProblem, maxFileBytes, type PlanTier } from "@clipiro/shared";
import { ARCHIVE_RETENTION_DAYS as WEB_RETENTION } from "./asset-cleanup";
import { MAX_UPLOAD_BYTES_BY_TIER, STORAGE_LIMIT_GB as WEB_STORAGE } from "./plans/tiers";

// The phone shows storage limits and the archive window from @clipiro/shared;
// this fails if the web's values change and the copy doesn't.
const TIERS: PlanTier[] = ["free", "creator", "pro", "studio"];

describe("mobile Assets rules match the web", () => {
  it("storage, per-file limits and archive retention", () => {
    for (const t of TIERS) {
      expect(STORAGE_LIMIT_GB[t]).toBe(WEB_STORAGE[t]);
      expect(maxFileBytes(t)).toBe(MAX_UPLOAD_BYTES_BY_TIER[t]);
    }
    expect(ARCHIVE_RETENTION_DAYS).toBe(WEB_RETENTION);
  });

  it("explains why an upload won't fit", () => {
    const MB = 1024 ** 2;
    expect(assetUploadProblem(300 * MB, 0, "free")).toMatch(/bigger than your plan/);
    expect(assetUploadProblem(100 * MB, 450 * MB, "free")).toMatch(/Not enough storage/);
    expect(assetUploadProblem(100 * MB, 0, "free")).toBeNull();
  });
});
