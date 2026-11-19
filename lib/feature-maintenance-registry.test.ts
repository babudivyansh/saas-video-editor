import { describe, expect, it } from "vitest";
import { existsSync } from "fs";
import path from "path";
import { startJobRequest } from "@clipiro/shared";
import { ALL_TOOLS } from "@/app/components/featureLinks";
import {
  MAINTENANCE_FEATURES,
  MOBILE_JOB_FEATURE,
  featureForApiCall,
  featureForPagePath,
  getMaintenanceFeature,
} from "./feature-maintenance-registry";

const root = path.resolve(__dirname, "..");

describe("feature maintenance registry", () => {
  it("lists every tool from the product's link registry, plus Social Tracker", () => {
    const ids = MAINTENANCE_FEATURES.map((f) => f.id);
    for (const tool of ALL_TOOLS) expect(ids).toContain(tool.slug);
    expect(ids).toContain("social-tracker");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every feature at least one API route, and every route/page exists", () => {
    for (const f of MAINTENANCE_FEATURES) {
      expect(f.apiPaths.length, f.id).toBeGreaterThan(0);
      for (const p of [...f.pagePaths, ...f.apiPaths]) {
        // `*` is a dynamic segment: check the static part before it.
        const staticPart = p.split("/*")[0];
        expect(existsSync(path.join(root, "app", staticPart)), `${f.id}: ${p}`).toBe(true);
      }
    }
  });

  it("maps a page (and its sub-pages) to its feature, longest prefix first", () => {
    expect(featureForPagePath("/dashboard/tools/voiceover")?.id).toBe("ai-voiceover");
    expect(featureForPagePath("/dashboard/captions/abc")?.id).toBe("caption-studio");
    expect(featureForPagePath("/dashboard/tools/free/audio-balancer")?.id).toBe("audio-balancer");
    expect(featureForPagePath("/dashboard/social-tracker/posts")?.id).toBe("social-tracker");
    expect(featureForPagePath("/dashboard/tools")).toBeUndefined();
    expect(featureForPagePath("/dashboard/tools/free")).toBeUndefined();
    expect(featureForPagePath("/dashboard/tools/voiceover-extra")).toBeUndefined();
    expect(featureForPagePath("/dashboard")).toBeUndefined();
  });

  it("gates only calls that start work — reads stay open", () => {
    expect(featureForApiCall("/api/tools/voiceover", "POST")?.id).toBe("ai-voiceover");
    expect(featureForApiCall("/api/tools/voiceover", "GET")).toBeUndefined();
    expect(featureForApiCall("/api/tools/photo-edit/suggest", "POST")?.id).toBe("ai-photo-editor");
    expect(featureForApiCall("/api/mobile/v1/projects/p1/editor", "PUT")?.id).toBe("video-editor");
    expect(featureForApiCall("/api/mobile/v1/projects/p1", "PATCH")).toBeUndefined();
    expect(featureForApiCall("/api/generate/auto-clip", "POST")?.id).toBe("auto-clip");
    expect(featureForApiCall("/api/social/posts", "POST")?.id).toBe("social-tracker");
    expect(featureForApiCall("/api/projects", "POST")).toBeUndefined();
  });

  it("maps every Android job type that starts work to a known feature", () => {
    const types = (startJobRequest.options as Array<{ shape: { type: { value: string } } }>).map((o) => o.shape.type.value);
    for (const t of types) {
      expect(MOBILE_JOB_FEATURE[t], t).toBeDefined();
      expect(getMaintenanceFeature(MOBILE_JOB_FEATURE[t]!), t).toBeDefined();
    }
  });
});
