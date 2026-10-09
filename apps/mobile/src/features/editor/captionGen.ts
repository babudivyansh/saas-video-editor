import { planCaptionGeneration, wordsToCaptionCues, type Asset, type CaptionClip, type TimelineDoc } from "@clipiro/shared";
import { editorTools } from "@/lib/api";

// Captions from the speech in the edit's videos, the way the web's Caption
// panel makes them: each video file is transcribed once (POST
// /editor/captions; Clip Minutes, 1 per started minute of the whole file),
// then its words are laid over every clip cut from it (wordsToCaptionCues,
// shared with the web), so trims and splits line up.

/** Spoken languages offered; "auto" lets the transcriber detect it. */
export const CAPTION_LANGUAGES = [
  { code: "auto", label: "Detect automatically" },
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "hi", label: "Hindi" },
  { code: "pt", label: "Portuguese" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "ar", label: "Arabic" },
  { code: "ja", label: "Japanese" },
] as const;

/** What generating captions will cost: 1 Clip Minute per started minute of each different video file. */
export function captionMinutes(doc: TimelineDoc, media: Record<string, Asset>): number {
  return planCaptionGeneration(doc).reduce((t, p) => t + Math.max(1, Math.ceil((media[p.assetId]?.durationSec ?? 60) / 60)), 0);
}

/** Look carried over from existing captions when they're made again. */
function carriedStyle(old: CaptionClip | undefined): Partial<CaptionClip> {
  if (!old) return {};
  const { fontFamily, fontSizePct, color, bold, bgColor, x, y, positionPreset, highlightMode, highlightColor, textTransform, strokeColor, strokeWidthPct } = old;
  return { fontFamily, fontSizePct, color, bold, bgColor, x, y, positionPreset, highlightColor, textTransform, strokeColor, strokeWidthPct, highlightMode: highlightMode === "none" ? "karaoke" : highlightMode };
}

/** Transcribes each video once and returns cues for the whole timeline. */
export async function generateCaptions(doc: TimelineDoc, language: string, onProgress: (done: number, of: number) => void): Promise<CaptionClip[]> {
  const plan = planCaptionGeneration(doc);
  const style = carriedStyle(doc.tracks.caption[0]);
  const cues: CaptionClip[] = [];
  for (let i = 0; i < plan.length; i++) {
    onProgress(i, plan.length);
    const p = plan[i]!;
    const { words } = await editorTools.captions({ assetId: p.assetId, languageCode: language === "auto" ? undefined : language });
    for (const clip of p.clips) cues.push(...wordsToCaptionCues(words, clip, style));
  }
  onProgress(plan.length, plan.length);
  return cues;
}
