import { describe, expect, it, vi } from "vitest";

// Modules under test reach lib/env at import time (via lib/reframe and the
// ffmpeg helpers); none of these tests needs a real value.
vi.mock("@/lib/env", () => ({
  env: { AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "test", AWS_SECRET_ACCESS_KEY: "test", AWS_S3_BUCKET: "test-bucket" },
}));
import { buildZoomTargets, densifyKeyframes } from "@/lib/camera-motion";
import { EMPTY_SIGNAL_TRACK, SIGNAL_HZ, type SignalTrack } from "@/lib/signal-track";
import { cameraPathOptionsFor, smoothKeyframePath, solveAxis, solveCameraPath, splitAtCuts } from "@/lib/autoclip-ai/camera-path";
import type { CropKeyframe } from "@/lib/reframe";

const flatTrack = (durationSec: number, energy = 0.4): SignalTrack => ({
  ...EMPTY_SIGNAL_TRACK,
  energy: new Array(Math.round(durationSec * SIGNAL_HZ)).fill(energy),
});

describe("planned zooms (edit plan → camera)", () => {
  it("holds a planned punch-in for its hold time, even with no energy track", () => {
    const t = buildZoomTargets(EMPTY_SIGNAL_TRACK, 10, { maxZoom: 1.2, planned: [{ tSec: 3, strength: 1, holdSec: 2 }] });
    expect(t[Math.round(2.5 * SIGNAL_HZ)]).toBe(1);
    expect(t[Math.round(3.5 * SIGNAL_HZ)]).toBeCloseTo(1.2, 5);
    expect(t[Math.round(5.5 * SIGNAL_HZ)]).toBe(1);
  });

  it("vetoes a planned push that lands on near-silence", () => {
    const track = flatTrack(10, 0.02);
    const t = buildZoomTargets(track, 10, { maxZoom: 1.2, planned: [{ tSec: 3, strength: 1, holdSec: 2 }] });
    expect(Math.max(...t)).toBe(1);
  });

  it("a reset returns the camera to normal framing", () => {
    const t = buildZoomTargets(EMPTY_SIGNAL_TRACK, 10, {
      maxZoom: 1.2, planned: [{ tSec: 2, strength: 1, holdSec: 5 }], resets: [4],
    });
    expect(t[Math.round(3 * SIGNAL_HZ)]).toBeGreaterThan(1);
    expect(t[Math.round(4.5 * SIGNAL_HZ)]).toBe(1);
  });

  it("with a plan, a weak energy bump does not add its own push", () => {
    const track = flatTrack(12, 0.3);
    for (let i = Math.round(8 * SIGNAL_HZ); i < Math.round(9 * SIGNAL_HZ); i++) track.energy[i] = 0.45;
    const withPlan = buildZoomTargets(track, 12, { maxZoom: 1.2, planned: [{ tSec: 2, strength: 0.5, holdSec: 1 }] });
    expect(withPlan[Math.round(8.5 * SIGNAL_HZ)]).toBe(1);
  });
});

describe("densifyKeyframes", () => {
  it("adds interpolated keyframes between sparse ones but never across a cut", () => {
    const kf: CropKeyframe[] = [
      { tSec: 0, x: 0, y: 0, w: 0.5, h: 1 },
      { tSec: 2, x: 0.2, y: 0, w: 0.5, h: 1 },
      { tSec: 2 + 1 / 30, x: 0.5, y: 0, w: 0.5, h: 1 },
      { tSec: 4, x: 0.5, y: 0, w: 0.5, h: 1 },
    ];
    const dense = densifyKeyframes(kf, 5);
    expect(dense.length).toBeGreaterThan(kf.length);
    // Nothing between the two cut keyframes.
    expect(dense.filter((k) => k.tSec > 2 + 1e-6 && k.tSec < 2 + 1 / 30 - 1e-6)).toEqual([]);
    expect(dense.find((k) => Math.abs(k.tSec - 1) < 1e-6)?.x).toBeCloseTo(0.1, 6);
  });
});

describe("camera path solver", () => {
  const opts = { deadZoneFrac: 0.2, maxSpeed: 0.3, maxAccel: 0.9, hz: 10 };

  it("holds still while the subject jitters inside the dead zone", () => {
    const targets = Array.from({ length: 50 }, (_, i) => ({ t: i / 10, v: 0.5 + (i % 2 ? 0.03 : -0.03) }));
    const path = solveAxis(targets, 5, 0.25, 0.5, opts);
    expect(Math.max(...path) - Math.min(...path)).toBeLessThan(1e-9);
  });

  it("follows a subject that leaves the dead zone, within the speed limit, and settles", () => {
    const targets = [{ t: 0, v: 0.3 }, { t: 1, v: 0.3 }, { t: 1.01, v: 0.7 }, { t: 10, v: 0.7 }];
    const path = solveAxis(targets, 10, 0.25, 0.5, opts);
    for (let i = 1; i < path.length; i++) expect(Math.abs(path[i] - path[i - 1])).toBeLessThanOrEqual(opts.maxSpeed / opts.hz + 1e-9);
    expect(Math.abs(path[path.length - 1] - 0.7)).toBeLessThan(0.2 * 0.5);
  });

  it("keeps the crop inside the frame", () => {
    const kf = solveCameraPath([{ t: 0, cx: 0.99, cy: 0.5 }, { t: 3, cx: 0.0, cy: 0.5 }], 3, 0.4, 1, opts);
    for (const k of kf) {
      expect(k.x).toBeGreaterThanOrEqual(-1e-9);
      expect(k.x + k.w).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("maps the Smoothness and Tracking speed sliders onto the solver", () => {
    expect(cameraPathOptionsFor(100, 50).deadZoneFrac).toBeGreaterThan(cameraPathOptionsFor(0, 50).deadZoneFrac);
    expect(cameraPathOptionsFor(50, 100).maxSpeed).toBeGreaterThan(cameraPathOptionsFor(50, 0).maxSpeed);
  });

  it("re-solves each run between cuts and keeps the cut itself", () => {
    const kf: CropKeyframe[] = [
      { tSec: 0, x: 0.1, y: 0, w: 0.3, h: 1 },
      { tSec: 3, x: 0.12, y: 0, w: 0.3, h: 1 },
      { tSec: 3 + 1 / 30, x: 0.6, y: 0, w: 0.3, h: 1 },
      { tSec: 6, x: 0.6, y: 0, w: 0.3, h: 1 },
    ];
    expect(splitAtCuts(kf)).toHaveLength(2);
    const smooth = smoothKeyframePath(kf, opts);
    const runs = splitAtCuts(smooth);
    expect(runs).toHaveLength(2);
    expect(runs[1][0].x).toBeCloseTo(0.6, 3);
  });
});

describe("energy zoom on a still speaker (regression, 2026-11-21)", () => {
  // A speaker who barely moves simplifies to two keyframes. Applying the zoom
  // curve to those alone turned three 2s punch-ins at ~1.12x into one 30s
  // ramp to 1.05x. The render now resamples the path first.
  it("applies the punch-ins at their own times and strength", async () => {
    const { simplifyKeyframes } = await import("@/lib/reframe");
    const { buildCameraZoom, applyZoomToKeyframes } = await import("@/lib/camera-motion");
    const dur = 30;
    const raw = Array.from({ length: 61 }, (_, i) => ({ tSec: i * 0.5, x: 0.34, y: 0, w: 0.3164, h: 1 }));
    const path = simplifyKeyframes(raw);
    expect(path.length).toBe(2);

    // Quiet speech with three loud moments: the camera should push in on
    // each and release between them.
    const energy = new Array(dur * SIGNAL_HZ).fill(0.1);
    for (const s of [6, 14, 22]) for (let i = s * SIGNAL_HZ; i < (s + 2) * SIGNAL_HZ; i++) energy[i] = 0.9;
    const curve = buildCameraZoom({ ...EMPTY_SIGNAL_TRACK, energy }, dur, { maxZoom: 1.14 });
    const peak = Math.max(...curve);

    const zoomOf = (k: CropKeyframe) => 0.3164 / k.w;
    const before = applyZoomToKeyframes(path, curve);
    expect(Math.max(...before.map(zoomOf))).toBeLessThan(peak - 0.05); // the bug

    const after = simplifyKeyframes(applyZoomToKeyframes(densifyKeyframes(path), curve), undefined, 64);
    expect(Math.max(...after.map(zoomOf))).toBeGreaterThan(peak - 0.01);
    // Back to normal framing between the pushes, not one long ramp.
    const at = (t: number) => after.reduce((best, k) => (Math.abs(k.tSec - t) < Math.abs(best.tSec - t) ? k : best));
    expect(zoomOf(at(11))).toBeLessThan(1.02);
  });
});
