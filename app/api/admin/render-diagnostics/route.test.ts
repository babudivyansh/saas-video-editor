// Regression test for a real bug caught during the P0-2 SEV-1 investigation:
// run()'s output used to be truncated to the last 4000 chars before the
// caller could search it for a substring (e.g. "libx264" in a long
// `ffmpeg -encoders` listing). Since the match is earlier in that listing,
// this silently produced a false "encoder missing" report — exactly the
// kind of wrong evidence a SEV-1 diagnostic tool must never emit. Verified
// locally against the real bundled ffmpeg binary before this fix ever
// reached production.

import { describe, expect, it, vi } from "vitest";
import path from "path";
import fs from "fs";
import os from "os";

// Only run() (a pure helper) is under test — mock withAdmin so importing the
// route doesn't pull in the full auth/env validation chain, which isn't
// relevant here and isn't configured in this test environment.
vi.mock("@/lib/admin/api", () => ({ withAdmin: (handler: unknown) => handler }));

const { run, parseFilterNames, probeBinary, smokeTests } = await import("./route");

// The binary the application actually resolves (pinned vendor runtime in
// production/CI-on-Linux, ffmpeg-static in local development) — NOT a
// hard-coded node_modules path. On Linux that path is the drawtext-less
// build this fix replaces, so testing it would assert against the wrong
// runtime entirely.
const { ffmpegBin } = await import("@/utils/ffmpeg-render");

describe("run() — output completeness (the actual bug this test guards against)", () => {
  it("returns the full stdout of a long listing, not just a tail slice that could cut off an earlier match", async () => {
    const result = await run(ffmpegBin, ["-hide_banner", "-encoders"]);
    expect(result.spawnError).toBeNull();
    // The real regression: this used to be false because the match sits
    // earlier in the listing than the last-4000-chars slice covered.
    expect(/\blibx264\b/.test(result.stdout)).toBe(true);
    expect(/\baac\b/.test(result.stdout)).toBe(true);
  });

  it("a real minimal encode using this app's own encoder request succeeds end-to-end (proves the encoders are genuinely usable, not just listed)", async () => {
    const out = path.join(os.tmpdir(), `run-test-smoke-${Date.now()}.mp4`);
    try {
      const result = await run(ffmpegBin, [
        "-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=30", "-t", "1",
        "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", out,
      ], 20_000);
      expect(result.spawnError).toBeNull();
      expect(result.code).toBe(0);
      expect(fs.existsSync(out)).toBe(true);
      expect(fs.statSync(out).size).toBeGreaterThan(0);
    } finally {
      try { fs.unlinkSync(out); } catch { /* best effort */ }
    }
  });

  it("parses `-filters` output into real filter names (guards the same false-negative class as the truncation bug)", async () => {
    const result = await run(ffmpegBin, ["-hide_banner", "-filters"]);
    expect(result.spawnError).toBeNull();
    // The exact parser the route uses, not a copy of it.
    const names = parseFilterNames(result.stdout);
    expect(names.length).toBeGreaterThan(100);
    // Filters the editor's filtergraph always emits — if the parse is wrong
    // these come back "missing" and the route reports a false root cause.
    for (const f of ["scale", "crop", "concat", "overlay", "fps", "trim"]) {
      expect(names).toContain(f);
    }
    // Sanity: header/legend lines must not be picked up as filter names.
    expect(names).not.toContain("=");
    expect(names).not.toContain("Filters:");
    // drawtext IS present locally (Windows ffmpeg-static ships 6.1.1) and is
    // absent in production (linux ships 7.0.2 without harfbuzz) — the exact
    // platform split behind P0-2. Asserting it here documents that the
    // parser reports drawtext correctly when it genuinely exists, so an
    // "absent" reading from production is a real finding and not a parse bug.
    expect(names).toContain("drawtext");
  });

  it("extracts build configuration flag names from `-version`", async () => {
    const result = await run(ffmpegBin, ["-version"]);
    expect(result.spawnError).toBeNull();
    const flags = [...result.stdout.matchAll(/--(?:enable|disable)-[\w-]+/g)].map((m) => m[0]);
    expect(flags.length).toBeGreaterThan(0);
    expect(flags.every((f) => f.startsWith("--enable-") || f.startsWith("--disable-"))).toBe(true);
  });

  it("probeBinary reports real capabilities for a working binary, and marks a missing one unusable", async () => {
    const good = await probeBinary(ffmpegBin);
    expect(good.usable).toBe(true);
    expect(good.versionFirstLine).toMatch(/ffmpeg version/i);
    // Local (Windows) ships 6.1.1 WITH drawtext — the platform split behind
    // P0-2. If this ever reads false locally the probe is broken, not the
    // binary, and a production "absent" reading could not be trusted.
    expect(good.filters?.drawtext).toBe(true);
    expect(good.encoders?.libx264).toBe(true);
    expect(good.encoders?.aac).toBe(true);
    expect(good.missingFilters).toEqual([]);

    const missing = await probeBinary(path.join(os.tmpdir(), "definitely-not-ffmpeg-xyz"));
    expect(missing.usable).toBe(false);
    expect(missing.reason).toBeTruthy();
  });

  it("smokeTests actually validate real output — all four pass against a capable binary", async () => {
    const results = await smokeTests(ffmpegBin, os.tmpdir());
    expect(results.map((r) => r.name)).toEqual([
      "A_basic_encode", "B_drawtext", "C_audio_aac", "D_subtitles_libass",
    ]);
    for (const r of results) {
      // Surface which one broke rather than a bare "false !== true".
      expect(`${r.name}:${r.passed}`).toBe(`${r.name}:true`);
      expect(r.exitCode).toBe(0);
      expect(r.outputBytes).toBeGreaterThan(0);
      expect(r.validation?.ok).toBe(true);
    }
  }, 180_000);

  it("smokeTests report failure (not a false pass) when the binary cannot do the job", async () => {
    const results = await smokeTests(path.join(os.tmpdir(), "definitely-not-ffmpeg-xyz"), os.tmpdir());
    expect(results.every((r) => r.passed === false)).toBe(true);
    expect(results.every((r) => r.spawnError !== null)).toBe(true);
  }, 60_000);

  it("reports a spawn error (not a silent empty result) for a genuinely missing binary", async () => {
    const result = await run(path.join(os.tmpdir(), "definitely-does-not-exist-ffmpeg-binary"), ["-version"]);
    expect(result.spawnError).not.toBeNull();
    expect(result.code).toBeNull();
  });
});
