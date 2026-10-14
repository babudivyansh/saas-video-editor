// "Export XML": a clip as an editable cut for Premiere Pro or DaVinci Resolve.
//
// FCP7 XML (xmeml v4) is the one interchange format both import. The sequence
// is the clip's window of the ORIGINAL video (startSec–endSec), not the
// rendered mp4: the point of exporting is to re-cut from the full-quality
// source. The source isn't in the zip (it can be hours long), so the editor
// asks to relink it on import; the README says so.
//
// Timing: the sequence runs on the untrimmed source window, the same timeline
// Clip.transcriptJson is stored on, so captions.srt lines up with it exactly.

export const XML_FPS = 30;

export interface WordTiming {
  word: string;
  start: number; // ms, relative to the clip's startSec
  end: number;
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function sequenceSize(aspectRatio: string): { width: number; height: number } {
  if (aspectRatio === "16:9") return { width: 1920, height: 1080 };
  if (aspectRatio === "1:1") return { width: 1080, height: 1080 };
  return { width: 1080, height: 1920 };
}

const frames = (sec: number) => Math.max(0, Math.round(sec * XML_FPS));

export interface XmemlInput {
  name: string;
  sourceFileName: string;
  sourceDurationSec: number | null;
  startSec: number;
  endSec: number;
  aspectRatio: string;
}

export function buildXmeml(input: XmemlInput): string {
  const { width, height } = sequenceSize(input.aspectRatio);
  const inF = frames(input.startSec);
  const outF = Math.max(inF + 1, frames(input.endSec));
  const len = outF - inF;
  const fileDur = Math.max(outF, frames(input.sourceDurationSec ?? 0));
  const name = escapeXml(input.name);
  const file = escapeXml(input.sourceFileName);
  const rate = `<rate><timebase>${XML_FPS}</timebase><ntsc>FALSE</ntsc></rate>`;

  const clipItem = (track: "video" | "audio", withFile: boolean) => `
            <clipitem id="${track}-1">
              <name>${file}</name>
              <duration>${fileDur}</duration>
              ${rate}
              <start>0</start>
              <end>${len}</end>
              <in>${inF}</in>
              <out>${outF}</out>
              ${
                withFile
                  ? `<file id="source-file">
                <name>${file}</name>
                <pathurl>file://localhost/${encodeURIComponent(input.sourceFileName)}</pathurl>
                ${rate}
                <duration>${fileDur}</duration>
                <media><video/><audio/></media>
              </file>`
                  : `<file id="source-file"/>`
              }
              ${track === "audio" ? "<sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>" : ""}
            </clipitem>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence id="sequence-1">
    <name>${name}</name>
    <duration>${len}</duration>
    ${rate}
    <media>
      <video>
        <format>
          <samplecharacteristics>
            ${rate}
            <width>${width}</width>
            <height>${height}</height>
            <pixelaspectratio>square</pixelaspectratio>
          </samplecharacteristics>
        </format>
        <track>${clipItem("video", true)}
        </track>
      </video>
      <audio>
        <track>${clipItem("audio", false)}
        </track>
      </audio>
    </media>
  </sequence>
</xmeml>
`;
}

function srtTime(ms: number): string {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor((t % 3_600_000) / 60_000);
  const s = Math.floor((t % 60_000) / 1000);
  const r = t % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

/**
 * Word timings → SRT cues of at most `maxWords` words, breaking early at a
 * pause or after sentence-ending punctuation so a cue doesn't straddle two
 * thoughts. Returns "" when there's nothing said.
 */
export function buildSrt(words: unknown, maxWords = 7, pauseMs = 700): string {
  if (!Array.isArray(words)) return "";
  const ws = (words as WordTiming[]).filter(
    (w) => typeof w?.word === "string" && w.word.trim() && Number.isFinite(w.start) && Number.isFinite(w.end),
  );
  const cues: WordTiming[][] = [];
  let cur: WordTiming[] = [];
  for (const w of ws) {
    const prev = cur[cur.length - 1];
    if (prev && (cur.length >= maxWords || w.start - prev.end > pauseMs || /[.!?]$/.test(prev.word.trim()))) {
      cues.push(cur);
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) cues.push(cur);

  return cues
    .map((c, i) => {
      const start = c[0].start;
      const end = Math.max(c[c.length - 1].end, start + 1);
      return `${i + 1}\n${srtTime(start)} --> ${srtTime(end)}\n${c.map((w) => w.word.trim()).join(" ")}\n`;
    })
    .join("\n");
}

export function exportReadme(sourceFileName: string): string {
  return [
    "Clipiro clip export",
    "",
    "clip.xml      The clip as an editable sequence (FCP7 XML).",
    "              Premiere Pro: File > Import.  DaVinci Resolve: File > Import > Timeline.",
    "captions.srt  What's said in the clip, timed to the sequence.",
    "",
    `The sequence is cut from your original video, "${sourceFileName}".`,
    "It isn't included here, so when you import, point the editor at your copy of",
    "that file (Premiere: Link Media; Resolve: Relink Clips). The cut points are kept.",
    "",
  ].join("\r\n");
}
