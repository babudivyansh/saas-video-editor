// Streamer title font resolution.
//
// The bug: runStreamerFFmpeg computed a font family from the style index and
// then discarded it. The emitted drawtext filter carried no `fontfile=` and no
// `font=`, so all 16 title styles rendered in whatever family fontconfig chose
// as its default — the styles differed only in colour and size — and whether a
// title rendered at all depended on the production host happening to have a
// usable default font. The build-time runtime gate does not cover that case:
// its drawtext smoke test passes an explicit fontfile.
//
// This is a Streamer rendering bug, not a P0-2 runtime issue. The pinned
// runtime supports drawtext; it was never being told what to draw with.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  STREAMER_FALLBACK_FONT,
  streamerFontFile,
  styleIndexToDrawtext,
  runStreamerFFmpeg,
  runFFmpegArgs,
  encodeArgs,
} from "./ffmpeg-render";

const STYLE_COUNT = 16;

describe("streamerFontFile", () => {
  it("resolves an existing file for every one of the 16 styles", () => {
    for (let i = 0; i < STYLE_COUNT; i++) {
      const { fontname } = styleIndexToDrawtext(i);
      expect(fontname, `style ${i} must name a family`).toBeTruthy();

      const file = streamerFontFile(fontname);
      expect(file, `style ${i} (${fontname}) resolved to nothing`).toBeTruthy();
      expect(fs.existsSync(file), `style ${i} (${fontname}) → ${file} does not exist`).toBe(true);
    }
  });

  it("falls back deterministically to a font that ships in this repo, never to the OS", () => {
    const file = streamerFontFile("A Family That Does Not Exist");
    expect(fs.existsSync(file)).toBe(true);
    // The fallback is a repo file, so it is present on every host regardless of
    // what fonts the OS has installed.
    expect(fs.existsSync(STREAMER_FALLBACK_FONT)).toBe(true);
  });

  it("covers the three families the styles actually reference", () => {
    const families = new Set(
      Array.from({ length: STYLE_COUNT }, (_, i) => styleIndexToDrawtext(i).fontname));
    expect(families).toEqual(new Set(["Arial", "Times New Roman", "Impact"]));
    for (const f of families) expect(fs.existsSync(streamerFontFile(f))).toBe(true);
  });

  it("distinct families resolve to distinct files, so styles are not silently identical", () => {
    // The point of the fix: Arial and Times New Roman must not collapse onto
    // one default face the way they did when no fontfile was passed.
    const arial = streamerFontFile("Arial");
    const times = streamerFontFile("Times New Roman");
    expect(arial).not.toBe(times);
  });
});

// ── Real renders ────────────────────────────────────────────────────────────
// String inspection alone would not have caught the original bug's real
// consequence, so these actually invoke the pinned runtime and compare output.

describe("runStreamerFFmpeg renders titles with the resolved font", () => {
  const tmp = os.tmpdir();
  const stamp = `streamer-font-${Date.now()}`;
  const src = path.join(tmp, `${stamp}-src.mp4`);
  const outputs: string[] = [];

  beforeAll(async () => {
    // 1s of colour with a silent audio track — enough for a real encode.
    await runFFmpegArgs([
      "-y", "-f", "lavfi", "-i", "color=c=navy:s=640x640:d=1",
      "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-shortest",
      ...encodeArgs(), src,
    ], 120_000);
  }, 180_000);

  afterAll(() => {
    for (const f of [src, ...outputs]) { try { fs.unlinkSync(f); } catch { /* best effort */ } }
  });

  // Three materially different families, one per face the styles use.
  const cases = [
    { style: 0, family: "Arial" },
    { style: 2, family: "Times New Roman" },
    { style: 7, family: "Impact" },
  ];

  for (const { style, family } of cases) {
    it(`renders style ${style} (${family}) without a font error`, async () => {
      expect(styleIndexToDrawtext(style).fontname).toBe(family);

      const out = path.join(tmp, `${stamp}-${style}.mp4`);
      outputs.push(out);

      // Would reject on "No usable font file found" / "Cannot find a valid
      // font" — the exact failure the missing fontfile risked in production.
      await runStreamerFFmpeg({
        userVideoPath: src,
        titleText: "Clipiro Title",
        drawtextOpts: styleIndexToDrawtext(style),
        outputPath: out,
      });

      expect(fs.existsSync(out)).toBe(true);
      expect(fs.statSync(out).size).toBeGreaterThan(1000);
    }, 180_000);
  }

  it("different fonts produce different pixels — proof the family is applied, not ignored", async () => {
    // Control first: the same font rendered twice must be byte-identical.
    // Without this, a difference between two fonts could just be mp4 metadata
    // (creation time and friends) and would prove nothing about glyphs.
    const control = path.join(tmp, `${stamp}-control.mp4`);
    outputs.push(control);
    await runStreamerFFmpeg({
      userVideoPath: src,
      titleText: "Clipiro Title",
      drawtextOpts: styleIndexToDrawtext(0), // same style as outputs[0]
      outputPath: control,
    });

    const [arial, times] = outputs;
    expect(
      fs.readFileSync(arial).equals(fs.readFileSync(control)),
      "same font twice must be byte-identical, or the comparison below proves nothing",
    ).toBe(true);

    // Same text, size, colour and input — so a difference can only be glyphs.
    // Under the old no-fontfile filter every style drew with one default face.
    expect(fs.readFileSync(arial).equals(fs.readFileSync(times))).toBe(false);
  }, 180_000);
});
