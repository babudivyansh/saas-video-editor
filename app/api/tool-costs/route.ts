import { NextResponse } from "next/server";
import { getAllToolConfigs, TOOL_SERVICE } from "@/lib/tool-config";

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
  "video-generator": "Veo3 AI Video",
  "youtube-downloader": "YouTube Downloader",
  "instagram-downloader": "Instagram Downloader",
  "background-remover": "Background Remover",
  "face-swap": "AI Face Swap",
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
    }))
    .sort((a, b) => a.creditCost - b.creditCost || a.label.localeCompare(b.label));

  return NextResponse.json({ tools });
}
