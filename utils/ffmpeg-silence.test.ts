import { describe, expect, it } from "vitest";
import { parseSilenceLog } from "./ffmpeg-render";

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
