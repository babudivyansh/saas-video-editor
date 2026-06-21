import type { Caption } from "./types";
import { randomUUID } from "crypto";

function timeToSeconds(t: string): number {
  // "HH:MM:SS,mmm" or "HH:MM:SS.mmm"
  const [hms, ms] = t.replace(",", ".").split(".");
  const [h, m, s] = hms.split(":").map(Number);
  return h * 3600 + m * 60 + s + (ms ? parseInt(ms) / 1000 : 0);
}

export function parseSRT(content: string): Caption[] {
  const blocks = content.trim().replace(/\r\n/g, "\n").split(/\n\n+/);
  const captions: Caption[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 3) continue;

    // First line may be a numeric index — skip it
    let offset = 0;
    if (/^\d+$/.test(lines[0])) offset = 1;

    const timeLine = lines[offset];
    const match = timeLine.match(/(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/);
    if (!match) continue;

    const text = lines.slice(offset + 1).join(" ").trim();
    if (!text) continue;

    captions.push({
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
      startTime: timeToSeconds(match[1]),
      endTime: timeToSeconds(match[2]),
      text,
    });
  }

  return captions;
}

export function secondsToSRTTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}
