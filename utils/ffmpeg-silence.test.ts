import { describe, expect, it } from "vitest";
import { parseSignalStatsLog, parseSilenceLog } from "./ffmpeg-render";

describe("parseSilenceLog", () => {
  const log = [
    "[silencedetect @ 0x1] silence_start: 1.25",
    "[silencedetect @ 0x1] silence_end: 2.5 | silence_duration: 1.25",
    "[silencedetect @ 0x1] silence_start: 7.8",
  ].join("\n");

  it("returns spans in source time and closes one still open at the end", () => {
    expect(parseSilenceLog(log, 10, 9)).toEqual([
      { start: 11.25, end: 12.5 },
      { start: 17.8, end: 19 },
    ]);
  });

  it("ignores an end with no start", () => {
    expect(parseSilenceLog("silence_end: 3 | silence_duration: 1", 0, 5)).toEqual([]);
  });
});

describe("parseSignalStatsLog", () => {
  it("pairs each frame's signalstats keys into one record", () => {
    const frame = (y: number) =>
      `[Parsed_metadata_4 @ 0x1] frame:0 pts:0\n[Parsed_metadata_4 @ 0x1] lavfi.signalstats.YLOW=40\n` +
      `[Parsed_metadata_4 @ 0x1] lavfi.signalstats.YAVG=${y}\n[Parsed_metadata_4 @ 0x1] lavfi.signalstats.YHIGH=200\n` +
      `[Parsed_metadata_4 @ 0x1] lavfi.signalstats.UAVG=125.5\n[Parsed_metadata_4 @ 0x1] lavfi.signalstats.VAVG=130\n` +
      `[Parsed_metadata_4 @ 0x1] lavfi.signalstats.SATAVG=12.25\n`;
    expect(parseSignalStatsLog(frame(100) + frame(120))).toEqual([
      { y: 100, spread: 160, sat: 12.25, u: 125.5, v: 130 },
      { y: 120, spread: 160, sat: 12.25, u: 125.5, v: 130 },
    ]);
    expect(parseSignalStatsLog("nothing here")).toEqual([]);
  });
});
