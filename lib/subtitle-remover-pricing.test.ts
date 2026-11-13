import { describe, it, expect } from "vitest";
import { subtitleRemoverCredits, SUBTITLE_REMOVER_CREDIT_RANGE } from "./subtitle-remover-pricing";
import { REVENUE_FLOOR_USD_PER_CREDIT } from "./plans/tiers";
import { PIAPI_USD_PER_SEC } from "./subtitle-remover/piapi";
import { parseVideoStreamInfo } from "@/utils/ffmpeg-render";

describe("subtitleRemoverCredits", () => {
  it("bottom mode is unchanged: 1 per 10 s, 2-20 (the mobile app quotes the same)", () => {
    expect(subtitleRemoverCredits(5)).toBe(2);
    expect(subtitleRemoverCredits(95)).toBe(10);
    expect(subtitleRemoverCredits(600)).toBe(20);
    expect(subtitleRemoverCredits(600, "bottom")).toBe(20);
  });
  it("marked-area mode: 1 per minute, 1-10", () => {
    expect(subtitleRemoverCredits(10, "region")).toBe(1);
    expect(subtitleRemoverCredits(61, "region")).toBe(2);
    expect(subtitleRemoverCredits(600, "region")).toBe(10);
  });
  it("AI erase keeps at least a 3x margin over PiAPI's per-second price at the net floor", () => {
    for (const sec of [1, 4, 30, 61, 299, 600]) {
      const revenue = subtitleRemoverCredits(sec, "auto") * REVENUE_FLOOR_USD_PER_CREDIT;
      expect(revenue / (Math.ceil(sec) * PIAPI_USD_PER_SEC)).toBeGreaterThanOrEqual(3);
    }
  });
  it("range covers every mode", () => {
    expect(SUBTITLE_REMOVER_CREDIT_RANGE).toEqual({ min: 1, max: 150 });
  });
});

describe("parseVideoStreamInfo", () => {
  it("reads codec, pixel format, rotation and audio", () => {
    const phone = [
      "  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1920x1080, 15000 kb/s, 30 fps",
      "      Side data:",
      "        displaymatrix: rotation of -90.00 degrees",
      "  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 192 kb/s",
    ].join("\n");
    expect(parseVideoStreamInfo(phone)).toEqual({ codec: "h264", pixFmt: "yuv420p", rotated: true, hasAudio: true });
    // ffmpeg 6.1's spelling, from a real `ffmpeg -i` of a rotated MP4.
    const ffmpeg61 = [
      "  Stream #0:0[0x1](und): Video: h264 (High 4:4:4 Predictive) (avc1 / 0x31637661), yuv444p(progressive), 1920x1080 [SAR 1:1 DAR 16:9], 168 kb/s, 30 fps",
      "      Display Matrix: rotation of 90.00 degrees",
    ].join("\n");
    expect(parseVideoStreamInfo(ffmpeg61)).toEqual({ codec: "h264", pixFmt: "yuv444p", rotated: true, hasAudio: false });
    const webm ="  Stream #0:0: Video: vp9 (Profile 0), yuv420p(tv, progressive), 1280x720, SAR 1:1 DAR 16:9, 30 fps";
    expect(parseVideoStreamInfo(webm)).toEqual({ codec: "vp9", pixFmt: "yuv420p", rotated: false, hasAudio: false });
    expect(parseVideoStreamInfo("  Stream #0:0: Video: hevc (Main 10), yuv420p10le(tv), 3840x2160").pixFmt).toBe("yuv420p10le");
  });
});
