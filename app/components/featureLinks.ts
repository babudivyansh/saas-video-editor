// Single source of truth for the product's feature/tool links, mirrored from the
// dashboard (`app/dashboard/page.tsx`) and tools (`app/dashboard/tools/page.tsx`)
// pages. Both the navbar Features dropdown and the footer import these so the
// two surfaces always list the full, identical feature set.

export interface FeatureLink {
  title: string;
  desc: string;
  href: string;
  external?: boolean;
  image?: string;
  video?: string;
}

// Free tools + downloaders (no credits required).
export const FREE_FEATURES: FeatureLink[] = [
  { title: "Audio Balancer", desc: "Balance left & right audio channels", href: "/dashboard/tools/free/audio-balancer", image: "/tools/audio-balancer.jpg", video: "/tools/videos/audio-balancer.mp4" },
  { title: "Video Compressor", desc: "Shrink video size without quality loss", href: "/dashboard/tools/free/video-compressor", image: "/tools/video-compressor.jpg", video: "/tools/videos/video-compressor.mp4" },
  { title: "MP3 Converter", desc: "Convert any media file to MP3", href: "/dashboard/tools/free/mp3-converter", image: "/tools/mp3-converter.jpg", video: "/tools/videos/mp3-converter.mp4" },
  { title: "YouTube Downloader", desc: "Download YouTube videos in a click", href: "/dashboard/tools/youtube-downloader", image: "/tools/youtube-downloader.jpg", video: "/tools/videos/youtube-downloader.mp4" },
  { title: "Instagram Downloader", desc: "Save Reels, posts & IGTV", href: "/dashboard/tools/instagram-downloader", image: "/tools/instagram-downloader.jpg", video: "/tools/videos/instagram-downloader.mp4" },
];

// Video creation workflows (faceless videos, clipping, editing).
export const VIDEO_TOOLS: FeatureLink[] = [
  { title: "Video Editor", desc: "Multi-track timeline editor in your browser", href: "/dashboard/editor", image: "/tools/video-editor.jpg", video: "/tools/videos/video-editor.mp4" },
  { title: "Clipiro AutoClip", desc: "Long videos into viral clips, automatically", href: "/dashboard/create/auto-clip", image: "/tools/autoclip.jpg", video: "/tools/videos/autoclip.mp4" },
  { title: "Cut & Crop", desc: "Trim & stitch clips ready to edit", href: "/dashboard/cut-and-crop", image: "/tools/cut-crop.jpg", video: "/tools/videos/cut-crop.mp4" },
  { title: "AI Creator", desc: "Become an AI content creator in 3 steps", href: "/dashboard/ai-creator", image: "/tools/ai-creator.jpg", video: "/tools/videos/ai-creator.mp4" },
  { title: "Reddit Story Videos", desc: "Turn Reddit posts into viral videos", href: "/dashboard/create/reddit-video", image: "/tools/reddit-story.jpg", video: "/tools/videos/reddit-story.mp4" },
  { title: "Fake Texts Videos", desc: "Fake text-conversation story videos", href: "/dashboard/create/text-video", image: "/tools/fake-texts.jpg", video: "/tools/videos/fake-texts.mp4" },
  { title: "Viral Split Screen", desc: "Gameplay split-screen that retains viewers", href: "/dashboard/create/viral-split-screen", image: "/tools/split-screen.jpg", video: "/tools/videos/split-screen.mp4" },
];

// AI tools (single-purpose generators / enhancers).
export const AI_TOOLS: FeatureLink[] = [
  { title: "AI Image Generator", desc: "High-quality AI images in seconds", href: "/dashboard/tools/image-generator", image: "/tools/ai-image-generator.jpg", video: "/tools/videos/ai-image-generator.mp4" },
  { title: "AI Voiceover", desc: "Lifelike voiceovers · 50+ narrators", href: "/dashboard/tools/voiceover", image: "/tools/ai-voiceover.jpg", video: "/tools/videos/ai-voiceover.mp4" },
  { title: "AI Video Generator", desc: "Generate AI videos with Google Veo3", href: "/dashboard/tools/video-generator", image: "/tools/veo3-video.jpg", video: "/tools/videos/veo3-video.mp4" },
  { title: "AI Face Swap", desc: "Swap faces in photos & videos", href: "/dashboard/tools/face-swap", image: "/tools/face-swap.jpg", video: "/tools/videos/face-swap.mp4" },
  { title: "Background Remover", desc: "Remove image / video backgrounds", href: "/dashboard/tools/background-remover", image: "/tools/background-remover.jpg", video: "/tools/videos/background-remover.mp4" },
  { title: "AI Voice Changer", desc: "Change any voice with AI", href: "/dashboard/tools/voice-changer", image: "/tools/voice-changer.jpg", video: "/tools/videos/voice-changer.mp4" },
  { title: "AI Vocal Remover", desc: "Strip vocals from audio or video", href: "/dashboard/tools/vocal-remover", image: "/tools/vocal-remover.jpg", video: "/tools/videos/vocal-remover.mp4" },
  { title: "AI Speech Enhancer", desc: "Clean up & enhance any audio", href: "/dashboard/tools/enhance-speech", image: "/tools/speech-enhancer.jpg", video: "/tools/videos/speech-enhancer.mp4" },
  { title: "Subtitle Remover", desc: "Remove burned-in subtitles with AI", href: "/dashboard/tools/subtitle-remover", image: "/tools/subtitle-remover.jpg", video: "/tools/videos/subtitle-remover.mp4" },
  { title: "AI Brainstormer", desc: "Viral content ideas for your niche", href: "/dashboard/tools/brainstormer", image: "/tools/brainstormer.jpg", video: "/tools/videos/brainstormer.mp4" },
];

// Resources (non-feature links shown in the navbar dropdown).
export const RESOURCES: FeatureLink[] = [
  { title: "Affiliate Program", desc: "Earn 20% recurring on every paid referral", href: "/affiliate-program" },
  { title: "Community Discord", desc: "Get support & connect with fellow creators", href: "/discord", external: true },
];
