import { describe, expect, it } from "vitest";
import { exportFilename, seriesToCsv, seriesToText, type ExportSeries } from "./export";

const series: ExportSeries[] = [
  {
    key: "followers",
    label: "Followers",
    unit: "count",
    points: [{ date: "2026-08-01", value: 1234 }, { date: "2026-08-03", value: 1300 }],
  },
  {
    key: "er",
    label: "Engagement rate",
    unit: "percent",
    points: [{ date: "2026-08-01", value: 4.25 }],
  },
];

describe("seriesToCsv", () => {
  it("exports raw numbers, not the screen's formatting", () => {
    // "1.2K" is text in a spreadsheet, not a number. The screen formats; the
    // file exports.
    const csv = seriesToCsv(series);
    expect(csv).toContain("1234");
    expect(csv).not.toContain("1.2K");
  });

  it("leaves a gap empty rather than filling it with zero", () => {
    const rows = seriesToCsv(series).split("\r\n");
    expect(rows[2]).toBe("3 Aug 2026,1300,");
  });

  it("neutralises a cell that a spreadsheet would execute as a formula", () => {
    // Post captions reach the content export, and a caption is attacker text.
    const csv = seriesToCsv([
      { key: "a", label: "=cmd|'/c calc'!A1", unit: "count", points: [{ date: "x", value: 1 }] },
    ], "Caption");
    expect(csv.split("\r\n")[0]).toBe("Caption,'=cmd|'/c calc'!A1");
  });

  it("quotes a value containing a comma or a quote", () => {
    const csv = seriesToCsv([
      { key: "a", label: 'He said "hi", loudly', unit: "count", points: [] },
    ], "Caption");
    expect(csv).toContain('"He said ""hi"", loudly"');
  });

  it("keeps caller order for categories and sorts only real dates", () => {
    const categorical: ExportSeries[] = [
      { key: "a", label: "A", unit: "count", points: [{ date: "Zebra", value: 1 }, { date: "Ant", value: 2 }] },
    ];
    const rows = seriesToCsv(categorical, "Stage").split("\r\n");
    expect(rows[1]).toBe("Zebra,1");
    expect(rows[2]).toBe("Ant,2");
  });
});

describe("seriesToText", () => {
  it("formats for humans, since it is pasted into a message", () => {
    const text = seriesToText(series);
    expect(text).toContain("1.2K");
    expect(text).toContain("4.3%");
    expect(text).toContain("—");
  });
});

describe("exportFilename", () => {
  it("slugs the title and dates the file", () => {
    expect(exportFilename("Follower growth", "png")).toMatch(/^follower-growth-\d{4}-\d{2}-\d{2}\.png$/);
  });

  it("falls back rather than producing a nameless file", () => {
    expect(exportFilename("!!!", "csv")).toMatch(/^chart-/);
  });
});
