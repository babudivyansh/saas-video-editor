// Regression protection for the P0-2 incident class: a deployed ffmpeg that
// satisfies 32 of 33 required filters and breaks 100% of exports on the one
// it is missing, with nothing noticing until users did.
//
// These tests deliberately do NOT rely solely on mocked capability booleans.
// The probe is exercised against the real bundled binary, because the bug
// being guarded against was precisely that a listing-level assumption
// ("libfreetype is enabled, so drawtext exists") did not match reality.

import { describe, expect, it, beforeEach } from "vitest";
import path from "path";
import os from "os";
import fs from "fs";
import {
  parseFilterNames,
  probeRuntimeCapabilities,
  getRenderRuntimeHealth,
  resetRenderRuntimeHealthCache,
  REQUIRED_FILTERS,
  REQUIRED_VIDEO_ENCODER,
  REQUIRED_AUDIO_ENCODER,
  RENDER_RUNTIME_UNAVAILABLE_MESSAGE,
} from "./render-runtime";

const realFfmpeg = (() => {
  const candidate = path.join(process.cwd(), "node_modules", "ffmpeg-static", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  return fs.existsSync(candidate) ? candidate : "ffmpeg";
})();
const missingBinary = path.join(os.tmpdir(), "definitely-not-ffmpeg-p02");

beforeEach(() => resetRenderRuntimeHealthCache());

describe("filter listing parser", () => {
  it("extracts real filter names and ignores the legend lines", () => {
    const sample = [
      "Filters:",
      "  T.. = Timeline support",
      "  .S. = Slice threading",
      "  ... abench            A->A       Benchmark part of a filtergraph.",
      "  T.. drawtext          V->V       Draw text on top of video frames.",
      "  ..C scale             V->V       Scale the input video size.",
    ].join("\n");
    const names = parseFilterNames(sample);
    expect(names).toEqual(["abench", "drawtext", "scale"]);
    // The legend rows must never masquerade as a filter — an earlier version
    // of this regex produced a filter literally named "=".
    expect(names).not.toContain("=");
  });
});

describe("probeRuntimeCapabilities — against the real binary", () => {
  it("reports a healthy runtime with every required filter and encoder", async () => {
    const caps = await probeRuntimeCapabilities(realFfmpeg);
    expect(caps.spawnError).toBeNull();
    expect(caps.version).toMatch(/ffmpeg version/i);
    // Fails loudly naming the gap rather than a bare boolean mismatch.
    expect(caps.missingFilters).toEqual([]);
    expect(caps.missingEncoders).toEqual([]);
    expect(caps.ok).toBe(true);
    expect(caps.totalFilters).toBeGreaterThan(100);
  }, 60_000);

  it("integration: the real binary genuinely provides drawtext (the P0-2 filter)", async () => {
    const caps = await probeRuntimeCapabilities(realFfmpeg);
    expect(caps.missingFilters).not.toContain("drawtext");
    expect(REQUIRED_FILTERS).toContain("drawtext");
    // subtitles is a separate capability and must be required independently —
    // the caption path depends on libass, not on drawtext.
    expect(REQUIRED_FILTERS).toContain("subtitles");
  }, 60_000);

  it("marks a runtime unhealthy when the binary cannot be executed at all", async () => {
    const caps = await probeRuntimeCapabilities(missingBinary);
    expect(caps.ok).toBe(false);
    expect(caps.spawnError).toBeTruthy();
    // An unusable binary must report the whole contract as missing, never an
    // empty (and therefore falsely reassuring) gap list.
    expect(caps.missingFilters).toEqual([...REQUIRED_FILTERS]);
    expect(caps.missingEncoders).toEqual([REQUIRED_VIDEO_ENCODER, REQUIRED_AUDIO_ENCODER]);
  }, 30_000);
});

describe("contract completeness", () => {
  it("requires every filter the four known drawtext-affected paths depend on", () => {
    for (const f of ["drawtext", "subtitles", "overlay", "scale", "crop", "xfade", "amix", "adelay", "volume", "fps", "format", "concat"]) {
      expect(REQUIRED_FILTERS).toContain(f);
    }
    expect(REQUIRED_FILTERS).toHaveLength(33);
  });

  it("requires the encoders the production render commands actually request", () => {
    expect(REQUIRED_VIDEO_ENCODER).toBe("libx264");
    expect(REQUIRED_AUDIO_ENCODER).toBe("aac");
  });
});

describe("health cache", () => {
  it("caches a healthy result", async () => {
    const first = await getRenderRuntimeHealth(realFfmpeg);
    const second = await getRenderRuntimeHealth(realFfmpeg);
    expect(first.ok).toBe(true);
    expect(second).toBe(first); // same promise result — not re-probed
  }, 60_000);

  it("does NOT cache a failure, so a transient fault cannot wedge exports off permanently", async () => {
    const bad = await getRenderRuntimeHealth(missingBinary);
    expect(bad.ok).toBe(false);
    const good = await getRenderRuntimeHealth(realFfmpeg);
    expect(good.ok).toBe(true);
  }, 60_000);
});

describe("user-facing message", () => {
  it("is sanitized — no ffmpeg, filter, binary or path detail leaks to the user", () => {
    expect(RENDER_RUNTIME_UNAVAILABLE_MESSAGE).toBe("Video export is temporarily unavailable. Please try again shortly.");
    expect(RENDER_RUNTIME_UNAVAILABLE_MESSAGE).not.toMatch(/ffmpeg|drawtext|filter|binary|encoder|\//i);
  });
});
