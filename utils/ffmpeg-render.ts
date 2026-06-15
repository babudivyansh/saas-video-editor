import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { WordTiming } from "./elevenlabs";
import ffmpegBin from "ffmpeg-static";

export interface SubtitleStyle {
  fontName?: string;
  fontSize?: number;
  highlightColor?: string; // ASS color e.g. "&H0000FFFF"
  baseColor?: string;      // ASS color e.g. "&H00FFFFFF"
}

function toASSTime(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = ((ms % 60_000) / 1000).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${s}`;
}

export function generateASS(
  words: WordTiming[],
  style: SubtitleStyle,
  assPath: string
): void {
  const fontName = style.fontName ?? "Outfit";
  const fontSize = style.fontSize ?? 80;
  const highlight = style.highlightColor ?? "&H0000FFFF";
  const base = style.baseColor ?? "&H00FFFFFF";

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${highlight},${base},&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,8,0,5,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const WORDS_PER_LINE = 5;
  let events = "";

  for (let i = 0; i < words.length; i += WORDS_PER_LINE) {
    const group = words.slice(i, i + WORDS_PER_LINE);
    const start = toASSTime(group[0].start);
    const end = toASSTime(group[group.length - 1].end);
    let text = "";
    for (const w of group) {
      const durationCs = Math.max(1, Math.round((w.end - w.start) / 10));
      text += `{\\kf${durationCs}}${w.word} `;
    }
    events += `Dialogue: 0,${start},${end},Default,,0,0,0,,${text.trim()}\n`;
  }

  fs.writeFileSync(assPath, header + events, "utf8");
}

export interface RenderOptions {
  bgVideoPath: string;   // local file or s3 presigned url
  voiceAudioPath: string;
  musicAudioPath?: string;
  assPath: string;
  outputPath: string;
}

export function runFFmpeg(opts: RenderOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const { bgVideoPath, voiceAudioPath, musicAudioPath, assPath, outputPath } = opts;

    // Escape the ass path for the subtitles filter (forward slashes, escape colons on Windows)
    const assEscaped = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");

    let args: string[];

    if (musicAudioPath) {
      args = [
        "-y",
        "-stream_loop", "-1", "-i", bgVideoPath,
        "-i", voiceAudioPath,
        "-i", musicAudioPath,
        "-filter_complex",
        `[2:a]volume=0.12[bgm];[1:a][bgm]amix=inputs=2:duration=first[audio];[0:v]crop=in_h*9/16:in_h,subtitles='${assEscaped}'[video]`,
        "-map", "[video]",
        "-map", "[audio]",
        "-c:v", "libx264",
        "-preset", "superfast",
        "-crf", "23",
        "-c:a", "aac",
        "-shortest",
        outputPath,
      ];
    } else {
      args = [
        "-y",
        "-stream_loop", "-1", "-i", bgVideoPath,
        "-i", voiceAudioPath,
        "-filter_complex",
        `[0:v]crop=in_h*9/16:in_h,subtitles='${assEscaped}'[video]`,
        "-map", "[video]",
        "-map", "1:a",
        "-c:v", "libx264",
        "-preset", "superfast",
        "-crf", "23",
        "-c:a", "aac",
        "-shortest",
        outputPath,
      ];
    }

    const proc = spawn(ffmpegBin!, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stderrBuf = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited ${code}:\n${stderrBuf.slice(-2000)}`));
      }
    });

    proc.on("error", (err) => reject(err));
  });
}

// ── Generic FFmpeg runner ────────────────────────────────────────────────────

export function runFFmpegArgs(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin!, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderrBuf = "";
    proc.stderr.on("data", (chunk: Buffer) => { stderrBuf += chunk.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited ${code}:\n${stderrBuf.slice(-2000)}`));
    });
    proc.on("error", (err) => reject(err));
  });
}

// ── Audio extraction ─────────────────────────────────────────────────────────

export function extractAudio(videoPath: string, audioPath: string): Promise<void> {
  return runFFmpegArgs(["-y", "-i", videoPath, "-vn", "-acodec", "libmp3lame", "-q:a", "3", audioPath]);
}

// ── Split-screen (vstack) ────────────────────────────────────────────────────

export interface SplitScreenOptions {
  userVideoPath: string;
  bgVideoPath: string;
  assPath: string;
  outputPath: string;
}

export function runSplitScreenFFmpeg(opts: SplitScreenOptions): Promise<void> {
  const { userVideoPath, bgVideoPath, assPath, outputPath } = opts;
  const assEscaped = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
  return runFFmpegArgs([
    "-y",
    "-i", userVideoPath,
    "-stream_loop", "-1", "-i", bgVideoPath,
    "-filter_complex",
    `[0:v]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960[top];` +
    `[1:v]scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960[bot];` +
    `[top][bot]vstack=inputs=2[stacked];` +
    `[stacked]subtitles='${assEscaped}'[video];` +
    `[0:a]aformat=sample_rates=44100:channel_layouts=stereo[audio]`,
    "-map", "[video]",
    "-map", "[audio]",
    "-c:v", "libx264", "-preset", "superfast", "-crf", "23",
    "-c:a", "aac", "-shortest",
    outputPath,
  ]);
}

// ── Streamer video (crop + drawtext) ────────────────────────────────────────

export interface DrawtextOptions {
  fontcolor: string;
  fontsize: number;
  fontname: string;
  shadowcolor: string;
  bordercolor: string;
  borderw: number;
}

export interface StreamerVideoOptions {
  userVideoPath: string;
  titleText: string;
  drawtextOpts: DrawtextOptions;
  outputPath: string;
}

export function runStreamerFFmpeg(opts: StreamerVideoOptions): Promise<void> {
  const { userVideoPath, titleText, drawtextOpts, outputPath } = opts;
  // Escape special chars for FFmpeg drawtext
  const escapedText = titleText
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");

  const dt = drawtextOpts;
  const drawFilter =
    `drawtext=text='${escapedText}':fontsize=${dt.fontsize}:fontcolor=${dt.fontcolor}:` +
    `x=(w-text_w)/2:y=h*0.08:borderw=${dt.borderw}:bordercolor=${dt.bordercolor}:` +
    `shadowx=2:shadowy=2:shadowcolor=${dt.shadowcolor}`;

  return runFFmpegArgs([
    "-y", "-i", userVideoPath,
    "-vf", `crop=in_h*9/16:in_h,${drawFilter}`,
    "-c:v", "libx264", "-preset", "superfast", "-crf", "23",
    "-c:a", "aac",
    outputPath,
  ]);
}

// ── Style-index → SubtitleStyle (for ASS subtitles) ────────────────────────

const W = "&H00FFFFFF"; // white
const Y = "&H0015CCFA"; // yellow  (#facc15 → BGR)
const C = "&H00EED322"; // cyan    (#22d3ee → BGR)
const G = "&H004ADE80"; // green   (#4ade80 → BGR)
const B = "&H00F6823B"; // blue    (#3b82f6 → BGR)
const P = "&H00D4B5C4"; // pink/purple (#c4b5fd → BGR)

export function styleIndexToSubtitleStyle(index: number, mode: "oneword" | "lines"): SubtitleStyle {
  const oneWord: SubtitleStyle[] = [
    { fontName: "Arial", fontSize: 80, highlightColor: Y, baseColor: W },   // 0 white+outline
    { fontName: "Arial", fontSize: 80, highlightColor: Y, baseColor: C },   // 1 cyan
    { fontName: "Times New Roman", fontSize: 78, highlightColor: W, baseColor: W }, // 2 Georgia glow
    { fontName: "Times New Roman", fontSize: 74, highlightColor: W, baseColor: W }, // 3 Georgia thin
    { fontName: "Arial", fontSize: 80, highlightColor: Y, baseColor: W },   // 4 italic
    { fontName: "Arial", fontSize: 76, highlightColor: Y, baseColor: W },   // 5 uppercase
    { fontName: "Arial", fontSize: 76, highlightColor: G, baseColor: G },   // 6 green
    { fontName: "Impact", fontSize: 80, highlightColor: Y, baseColor: W },  // 7 Impact italic
    { fontName: "Arial", fontSize: 76, highlightColor: Y, baseColor: W },   // 8 italic uppercase
    { fontName: "Arial", fontSize: 70, highlightColor: W, baseColor: W },   // 9 red badge
    { fontName: "Impact", fontSize: 80, highlightColor: Y, baseColor: W },  // 10 Impact
    { fontName: "Arial", fontSize: 74, highlightColor: Y, baseColor: W },   // 11 lighter
    { fontName: "Times New Roman", fontSize: 74, highlightColor: Y, baseColor: Y }, // 12 Georgia yellow
    { fontName: "Impact", fontSize: 80, highlightColor: Y, baseColor: Y },  // 13 Impact yellow glow
    { fontName: "Arial", fontSize: 76, highlightColor: Y, baseColor: Y },   // 14 yellow
    { fontName: "Arial", fontSize: 76, highlightColor: B, baseColor: B },   // 15 blue
  ];
  const lines: SubtitleStyle[] = [
    { fontName: "Arial", fontSize: 70, highlightColor: Y, baseColor: W },
    { fontName: "Arial", fontSize: 70, highlightColor: W, baseColor: W },
    { fontName: "Impact", fontSize: 70, highlightColor: B, baseColor: B },
    { fontName: "Arial", fontSize: 68, highlightColor: Y, baseColor: W },
    { fontName: "Impact", fontSize: 70, highlightColor: Y, baseColor: W },
    { fontName: "Times New Roman", fontSize: 70, highlightColor: Y, baseColor: Y },
    { fontName: "Impact", fontSize: 70, highlightColor: Y, baseColor: W },
    { fontName: "Arial", fontSize: 70, highlightColor: Y, baseColor: Y },
    { fontName: "Arial", fontSize: 70, highlightColor: C, baseColor: C },
    { fontName: "Arial", fontSize: 70, highlightColor: G, baseColor: G },
    { fontName: "Arial", fontSize: 70, highlightColor: W, baseColor: W },
    { fontName: "Impact", fontSize: 70, highlightColor: P, baseColor: P },
    { fontName: "Arial", fontSize: 70, highlightColor: Y, baseColor: W },
    { fontName: "Arial", fontSize: 70, highlightColor: W, baseColor: B },
    { fontName: "Arial", fontSize: 68, highlightColor: W, baseColor: W },
    { fontName: "Arial", fontSize: 70, highlightColor: P, baseColor: P },
  ];
  const arr = mode === "lines" ? lines : oneWord;
  return arr[Math.min(index, arr.length - 1)];
}

// ── Style-index → DrawtextOptions (for streamer video) ──────────────────────

export function styleIndexToDrawtext(index: number): DrawtextOptions {
  const map: DrawtextOptions[] = [
    { fontcolor: "white",    fontsize: 72, fontname: "Arial",           shadowcolor: "black",   bordercolor: "black",   borderw: 3 },
    { fontcolor: "0x22D3EE", fontsize: 72, fontname: "Arial",           shadowcolor: "black",   bordercolor: "black",   borderw: 3 },
    { fontcolor: "white",    fontsize: 72, fontname: "Times New Roman", shadowcolor: "white",   bordercolor: "white",   borderw: 0 },
    { fontcolor: "white",    fontsize: 70, fontname: "Times New Roman", shadowcolor: "white",   bordercolor: "white",   borderw: 0 },
    { fontcolor: "white",    fontsize: 72, fontname: "Arial",           shadowcolor: "black",   bordercolor: "black",   borderw: 3 },
    { fontcolor: "white",    fontsize: 68, fontname: "Arial",           shadowcolor: "black",   bordercolor: "black",   borderw: 3 },
    { fontcolor: "0x4ADE80", fontsize: 68, fontname: "Arial",           shadowcolor: "black",   bordercolor: "black",   borderw: 3 },
    { fontcolor: "white",    fontsize: 72, fontname: "Impact",          shadowcolor: "black",   bordercolor: "black",   borderw: 3 },
    { fontcolor: "white",    fontsize: 68, fontname: "Arial",           shadowcolor: "black",   bordercolor: "black",   borderw: 3 },
    { fontcolor: "white",    fontsize: 68, fontname: "Arial",           shadowcolor: "0xEF4444",bordercolor: "0xEF4444",borderw: 8 },
    { fontcolor: "white",    fontsize: 72, fontname: "Impact",          shadowcolor: "black",   bordercolor: "black",   borderw: 3 },
    { fontcolor: "white",    fontsize: 70, fontname: "Arial",           shadowcolor: "black",   bordercolor: "black",   borderw: 3 },
    { fontcolor: "0xFACC15", fontsize: 70, fontname: "Times New Roman", shadowcolor: "black",   bordercolor: "black",   borderw: 2 },
    { fontcolor: "0xFACC15", fontsize: 72, fontname: "Impact",          shadowcolor: "0xFACC15",bordercolor: "black",   borderw: 2 },
    { fontcolor: "0xFACC15", fontsize: 68, fontname: "Arial",           shadowcolor: "black",   bordercolor: "black",   borderw: 3 },
    { fontcolor: "0x3B82F6", fontsize: 68, fontname: "Arial",           shadowcolor: "white",   bordercolor: "white",   borderw: 3 },
  ];
  return map[Math.min(index, map.length - 1)];
}
