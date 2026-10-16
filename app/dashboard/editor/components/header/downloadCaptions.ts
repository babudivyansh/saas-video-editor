import type { TimelineDoc } from "@/lib/editor/types";
import { captionsToSrt } from "@/lib/editor/srt";

/** Saves the caption track as an .srt file through the browser. */
export function downloadCaptionsSrt(doc: TimelineDoc, name = "captions") {
  const srt = captionsToSrt(doc.tracks.caption);
  if (!srt) return;
  const url = URL.createObjectURL(new Blob([srt], { type: "application/x-subrip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^\w\- ]+/g, "").trim() || "captions"}.srt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
