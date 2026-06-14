import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { WordTiming } from "./elevenlabs";

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

    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

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
