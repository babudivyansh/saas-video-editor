// Single source of truth for the product's feature/tool links, mirrored from the
// dashboard (`app/dashboard/page.tsx`) and tools (`app/dashboard/tools/page.tsx`)
// pages. Both the navbar Features dropdown and the footer import these so the
// two surfaces always list the full, identical feature set.

export interface FeatureLink {
  title: string;
  desc: string;
  href: string;
  external?: boolean;
}

// Free tools + downloaders (no credits required).
export const FREE_FEATURES: FeatureLink[] = [
  { title: "Audio Balancer", desc: "Balance left & right audio channels", href: "/dashboard/tools/free/audio-balancer" },
  { title: "Video Compressor", desc: "Shrink video size without quality loss", href: "/dashboard/tools/free/video-compressor" },
  { title: "MP3 Converter", desc: "Convert any media file to MP3", href: "/dashboard/tools/free/mp3-converter" },
  { title: "YouTube Downloader", desc: "Download YouTube videos in a click", href: "/dashboard/tools/youtube-downloader" },
  { title: "Instagram Downloader", desc: "Save Reels, posts & IGTV", href: "/dashboard/tools/instagram-downloader" },
];

// Video creation workflows (faceless videos, clipping, editing).
export const VIDEO_TOOLS: FeatureLink[] = [
  { title: "Video Editor", desc: "Multi-track timeline editor in your browser", href: "/dashboard/editor" },
  { title: "Clipiro AutoClip", desc: "Long videos into viral clips, automatically", href: "/dashboard/create/auto-clip" },
  { title: "Cut & Crop", desc: "Trim & stitch clips ready to edit", href: "/dashboard/cut-and-crop" },
  { title: "AI Creator", desc: "Become an AI content creator in 3 steps", href: "/dashboard/ai-creator" },
  { title: "Reddit Story Videos", desc: "Turn Reddit posts into viral videos", href: "/dashboard/create/reddit-video" },
  { title: "Fake Texts Videos", desc: "Fake text-conversation story videos", href: "/dashboard/create/text-video" },
  { title: "Viral Split Screen", desc: "Gameplay split-screen that retains viewers", href: "/dashboard/create/viral-split-screen" },
];

// AI tools (single-purpose generators / enhancers).
export const AI_TOOLS: FeatureLink[] = [
  { title: "AI Image Generator", desc: "High-quality AI images in seconds", href: "/dashboard/tools/image-generator" },
  { title: "AI Voiceover", desc: "Lifelike voiceovers · 50+ narrators", href: "/dashboard/tools/voiceover" },
  { title: "Veo3 AI Video", desc: "Generate AI videos with Google Veo3", href: "/dashboard/tools/video-generator" },
  { title: "AI Face Swap", desc: "Swap faces in photos & videos", href: "/dashboard/tools/face-swap" },
  { title: "Background Remover", desc: "Remove image / video backgrounds", href: "/dashboard/tools/background-remover" },
  { title: "AI Voice Changer", desc: "Change any voice with AI", href: "/dashboard/tools/voice-changer" },
  { title: "AI Vocal Remover", desc: "Strip vocals from audio or video", href: "/dashboard/tools/vocal-remover" },
  { title: "AI Speech Enhancer", desc: "Clean up & enhance any audio", href: "/dashboard/tools/enhance-speech" },
  { title: "Subtitle Remover", desc: "Remove burned-in subtitles with AI", href: "/dashboard/tools/subtitle-remover" },
  { title: "AI Brainstormer", desc: "Viral content ideas for your niche", href: "/dashboard/tools/brainstormer" },
];

// Resources (non-feature links shown in the navbar dropdown).
export const RESOURCES: FeatureLink[] = [
  { title: "Affiliate Program", desc: "Earn 20% recurring on every paid referral", href: "/affiliate-program" },
  { title: "Community Discord", desc: "Get support & connect with fellow creators", href: "/discord", external: true },
];
