import { describe, expect, it } from "vitest";
import { buildSrt, buildXmeml, escapeXml, exportReadme, sequenceSize } from "./clip-export-xml";
import { copyKeyFor } from "./clip-duplicate";

describe("buildXmeml", () => {
  const xml = buildXmeml({
    name: `Sharp "save" & <run>`,
    sourceFileName: "My Vlog.mp4",
    sourceDurationSec: 600,
    startSec: 93.2,
    endSec: 105,
    aspectRatio: "9:16",
  });

  it("is a well-formed xmeml v4 document", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<xmeml version="4">');
    // Every opened element is closed: a crude but effective balance check.
    const opens = xml.match(/<([a-z]+)[\s>]/g)!.map((t) => t.slice(1, -1));
    for (const tag of new Set(opens)) {
      if (["xml", "file", "video", "audio"].includes(tag)) continue; // self-closing variants
      const open = (xml.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
      const close = (xml.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
      expect([tag, close]).toEqual([tag, open]);
    }
  });

  it("escapes the clip name", () => {
    expect(xml).toContain("<name>Sharp &quot;save&quot; &amp; &lt;run&gt;</name>");
  });

  it("trims the source to the clip window at 30 fps", () => {
    expect(xml).toContain("<in>2796</in>");
    expect(xml).toContain("<out>3150</out>");
    expect(xml).toContain("<end>354</end>");
    // The file's duration is the whole source, not the clip.
    expect(xml).toContain("<duration>18000</duration>");
  });

  it("sizes the sequence to the clip's aspect ratio", () => {
    expect(xml).toContain("<width>1080</width>");
    expect(xml).toContain("<height>1920</height>");
    expect(sequenceSize("16:9")).toEqual({ width: 1920, height: 1080 });
    expect(sequenceSize("1:1")).toEqual({ width: 1080, height: 1080 });
  });

  it("points at the original file by name, URL-encoded", () => {
    expect(xml).toContain("<pathurl>file://localhost/My%20Vlog.mp4</pathurl>");
  });

  it("never makes an empty or backwards cut", () => {
    const x = buildXmeml({ name: "x", sourceFileName: "a.mp4", sourceDurationSec: null, startSec: 10, endSec: 10, aspectRatio: "9:16" });
    expect(x).toContain("<in>300</in>");
    expect(x).toContain("<out>301</out>");
  });
});

describe("buildSrt", () => {
  const w = (word: string, start: number, end: number) => ({ word, start, end });

  it("times cues in SRT format", () => {
    expect(buildSrt([w("Hello", 0, 400), w("there.", 450, 900)])).toBe("1\n00:00:00,000 --> 00:00:00,900\nHello there.\n");
  });

  it("breaks at sentence ends, pauses and the word cap", () => {
    const srt = buildSrt(
      [w("One.", 0, 200), w("Two", 300, 500), w("three", 2000, 2200), w("a", 2300, 2400), w("b", 2500, 2600), w("c", 2700, 2800)],
      2,
    );
    expect(srt.split("\n\n").map((c) => c.split("\n")[2])).toEqual(["One.", "Two", "three a", "b c"]);
  });

  it("formats hours and skips junk words", () => {
    const srt = buildSrt([w("late", 3_723_004, 3_723_500), { word: "  ", start: 1, end: 2 }, { nope: 1 }]);
    expect(srt).toBe("1\n01:02:03,004 --> 01:02:03,500\nlate\n");
  });

  it("is empty with no transcript", () => {
    expect(buildSrt(null)).toBe("");
    expect(buildSrt([])).toBe("");
  });
});

describe("helpers", () => {
  it("escapeXml covers all five entities", () => {
    expect(escapeXml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;");
  });

  it("the README names the file to relink", () => {
    expect(exportReadme("My Vlog.mp4")).toContain('"My Vlog.mp4"');
  });

  it("copyKeyFor keeps the folder and extension", () => {
    expect(copyKeyFor("renders/p1/clip-0.mp4", "ab12")).toBe("renders/p1/clip-0-copy-ab12.mp4");
    expect(copyKeyFor("renders/p.1/clip", "ab12")).toBe("renders/p.1/clip-copy-ab12");
  });
});
