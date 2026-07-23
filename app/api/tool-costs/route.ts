import { NextResponse } from "next/server";
import { getAllToolConfigs, TOOL_SERVICE } from "@/lib/tool-config";
import { IMAGE_MODELS } from "@/lib/models/imageModels";
import { VIDEO_MODELS } from "@/lib/models/videoModels";

// Public: live per-feature credit costs for the pricing page "what each feature
// costs" table. Reads the same admin-editable tool config used for billing.
const LABELS: Record<string, string> = {
  "audio-balancer": "Audio Balancer",
  "mp3-converter": "MP3 Converter",
  "video-compressor": "Video Compressor",
  "enhance-prompt": "Prompt Enhancer",
  "brainstormer": "AI Brainstormer",
  "cut-and-crop": "Cut & Crop",
  "subtitle-remover": "Subtitle Remover",
  "image-generator": "AI Image Generator",
  "voiceover": "AI Voiceover",
  "vocal-remover": "Vocal Remover",
  "ai-creator": "AI Talking Avatar",
  "voice-changer": "AI Voice Changer",
  "reddit-video": "Reddit Story Video",
  "text-video": "Fake Text Video",
  "enhance-speech": "Speech Enhancer",
  "video-generator": "AI Video Generator",
  "youtube-downloader": "YouTube Downloader",
  "instagram-downloader": "Instagram Downloader",
  "background-remover": "Background Remover",
  "face-swap": "AI Face Swap",
};

// image-generator/video-generator have multiple swappable models with wildly
// different costs — a single flat number understates what premium models
// actually cost. These two get an additional min/max range; every other
// tool's shape is untouched.
const IMAGE_COSTS = IMAGE_MODELS.map(m => m.creditCost);
const VIDEO_COSTS = VIDEO_MODELS.map(m => m.creditsPerSecond * m.minDurationSeconds);
const RANGES: Record<string, { min: number; max: number }> = {
  "image-generator": { min: Math.min(...IMAGE_COSTS), max: Math.max(...IMAGE_COSTS) },
  "video-generator": { min: Math.min(...VIDEO_COSTS), max: Math.max(...VIDEO_COSTS) },
  // Matches creditCostForDuration's clamp in app/api/tools/subtitle-remover/route.ts.
  "subtitle-remover": { min: 2, max: 20 },
};

export async function GET() {
  const cfg = await getAllToolConfigs();
  const tools = Object.entries(cfg)
    .filter(([, c]) => c.enabled)
    .map(([slug, c]) => ({
      slug,
      label: LABELS[slug] ?? slug,
      service: TOOL_SERVICE[slug] ?? "",
      creditCost: c.creditCost,
      creditCostMin: RANGES[slug]?.min,
      creditCostMax: RANGES[slug]?.max,
    }))
    .sort((a, b) => a.creditCost - b.creditCost || a.label.localeCompare(b.label));

  return NextResponse.json({ tools });
}
