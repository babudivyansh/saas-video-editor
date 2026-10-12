import {
  assistantSendRequest,
  homeSummarySchema,
  toolsResponseSchema,
  type AssistantMessage,
  type AssistantSendRequest,
  type HomeSummary,
  type Tool,
} from "@clipiro/shared";
import { respond } from "./core";

// Stand-in for the Home tab's API (/api/mobile/v1/me/summary, /tools,
// /assistant). Responses are parsed with the shared schemas, so a shape drift
// fails here first. Scenarios (core.ts): "home", "tools", "assistant".

const TOP_CLIPS = [
  { id: "clp_1", score: 92, durationSec: 41, thumbnailUrl: "asset:creator-smile" },
  { id: "clp_2", score: 88, durationSec: 28, thumbnailUrl: "asset:founder-portrait" },
  { id: "clp_3", score: 81, durationSec: 35, thumbnailUrl: "asset:creator-violet" },
  { id: "clp_4", score: 84, durationSec: 44, thumbnailUrl: "asset:gym-lift" },
];

const MAYA_SUMMARY: HomeSummary = {
  user: { name: "Maya Okafor", avatarUrl: "asset:creator-golden" },
  clipMinutes: { remaining: 1000, total: 1200 },
  aiCredits: { remaining: 1171 },
  clips: { total: 24, top: TOP_CLIPS },
  projects: { active: 3, rendering: 1, renderProgress: 75 },
  creator: { level: "Pro Creator", xp: 1450, nextLevelXp: 2600 },
  unreadNotifications: 2,
  referralPercent: 20,
};

/** A brand-new account: nothing made yet. */
const NEW_USER_SUMMARY: HomeSummary = {
  user: { name: "Maya Okafor", avatarUrl: null },
  clipMinutes: { remaining: 30, total: 30 },
  aiCredits: { remaining: 10 },
  clips: { total: 0, top: [] },
  projects: { active: 0, rendering: 0, renderProgress: null },
  creator: { level: "Beginner", xp: 0, nextLevelXp: 500 },
  unreadNotifications: 0,
  referralPercent: 20,
};

export async function getHomeSummary(): Promise<HomeSummary> {
  const s = await respond("home");
  return homeSummarySchema.parse(s === "empty" ? NEW_USER_SUMMARY : MAYA_SUMMARY);
}

// Real catalogue and prices: app/dashboard/tools + lib/tool-costs.ts on the web.
const TOOLS: Tool[] = [
  { id: "autoclip", name: "AutoClip", shortName: "AutoClip", description: "Long video in, clips out", category: "video", cost: { kind: "clipMinutes" }, requiredTier: null, recommended: false },
  { id: "cut-and-crop", name: "Cut & Crop", shortName: "Cut & Crop", description: "Trim and reframe a video", category: "video", cost: { kind: "credits", amount: 1, per: null, from: false }, requiredTier: null, recommended: false },
  { id: "voice-changer", name: "Voice Changer", shortName: "Voice Changer", description: "Swap your voice for another", category: "audio", cost: { kind: "credits", amount: 8, per: "min", from: false }, requiredTier: null, recommended: false },
  { id: "subtitle-remover", name: "Subtitle Remover", shortName: "Subtitle Remover", description: "Erase burned-in captions", category: "video", cost: { kind: "credits", amount: 4, per: null, from: false }, requiredTier: "pro", recommended: false },
  { id: "face-swap", name: "AI Face Swap", shortName: "AI Face Swap", description: "Swap a face in a photo", category: "image", cost: { kind: "credits", amount: 2, per: null, from: false }, requiredTier: "pro", recommended: false },
  { id: "enhance-speech", name: "AI Speech Enhancer", shortName: "Speech Enhancer", description: "Studio-clean voice from any recording", category: "audio", cost: { kind: "credits", amount: 8, per: "min", from: false }, requiredTier: null, recommended: false },
  { id: "vocal-remover", name: "AI Vocal Remover", shortName: "Vocal Remover", description: "Split vocals from music", category: "audio", cost: { kind: "credits", amount: 1, per: "30 s", from: false }, requiredTier: null, recommended: false },
  { id: "background-remover", name: "Background Remover", shortName: "Background Remover", description: "Cut out the subject of a photo", category: "image", cost: { kind: "credits", amount: 1, per: null, from: false }, requiredTier: null, recommended: false },
  { id: "image-generator", name: "AI Image Generator", shortName: "Image Generator", description: "Generate images in seconds with 9 models", category: "image", cost: { kind: "credits", amount: 2, per: null, from: true }, requiredTier: null, recommended: true },
  { id: "voiceover", name: "AI Voiceover", shortName: "Voiceover", description: "Natural narration from your script", category: "audio", cost: { kind: "credits", amount: 1, per: "500 chars", from: false }, requiredTier: null, recommended: true },
  { id: "brainstormer", name: "AI Brainstormer", shortName: "Brainstormer", description: "Viral ideas for your niche", category: "video", cost: { kind: "free" }, requiredTier: null, recommended: true },
  { id: "youtube-downloader", name: "YouTube Downloader", shortName: "YouTube Downloader", description: "Save a YouTube video", category: "video", cost: { kind: "credits", amount: 1, per: null, from: false }, requiredTier: null, recommended: false },
  { id: "instagram-downloader", name: "Instagram Downloader", shortName: "Instagram Downloader", description: "Save an Instagram Reel", category: "video", cost: { kind: "credits", amount: 1, per: null, from: false }, requiredTier: null, recommended: false },
  { id: "video-compressor", name: "Video Compressor", shortName: "Video Compressor", description: "Shrink a video file", category: "video", cost: { kind: "free" }, requiredTier: null, recommended: false },
  { id: "audio-balancer", name: "Audio Balancer", shortName: "Audio Balancer", description: "Even out loud and quiet parts", category: "audio", cost: { kind: "free" }, requiredTier: null, recommended: false },
  { id: "mp3-converter", name: "MP3 Converter", shortName: "MP3 Converter", description: "Turn a video into an MP3", category: "audio", cost: { kind: "free" }, requiredTier: null, recommended: false },
];

export async function getTools(): Promise<Tool[]> {
  const s = await respond("tools");
  return toolsResponseSchema.parse({ tools: s === "empty" ? [] : TOOLS }).tools;
}

// The conversation drawn in design/screens/BN-Assistant.html.
const HISTORY: AssistantMessage[] = [
  { id: "m1", role: "user", text: "Find the best hooks in my Ep. 42 podcast and make Shorts from them", createdAt: "2026-10-01T18:42:00+05:30" },
  {
    id: "m2",
    role: "assistant",
    text: "I found 12 moments in **Founders Pod · Ep. 42**. These four have the strongest hooks for Shorts:",
    createdAt: "2026-10-01T18:42:10+05:30",
    clips: [
      { id: "clp_1", score: 92, durationSec: 41, thumbnailUrl: "asset:creator-smile" },
      { id: "clp_2", score: 88, durationSec: 28, thumbnailUrl: "asset:founder-portrait" },
      { id: "clp_3", score: 81, durationSec: 35, thumbnailUrl: "asset:creator-violet" },
      { id: "clp_5", score: 69, durationSec: 44, thumbnailUrl: "asset:creator-golden" },
    ],
    checklist: ["Captions: Bold Impact, word by word", "Reframed to 9:16, speaker tracked", "Uses ~59 Clip Minutes"],
    actions: [
      { id: "review-clips", label: "Review clips" },
      { id: "change-style", label: "Change style" },
    ],
  },
  { id: "m3", role: "user", text: "Can you also write a caption for the first one?", createdAt: "2026-10-01T18:43:00+05:30" },
];

export const ASSISTANT_SUGGESTIONS = ["Write 3 hooks for my next Short", "Best time to post on YouTube?", "Write a caption for Reels"];

export async function getAssistantHistory(): Promise<AssistantMessage[]> {
  const s = await respond("assistant");
  return s === "empty" ? [] : HISTORY;
}

let replyCount = 0;
export async function sendAssistantMessage(input: AssistantSendRequest): Promise<AssistantMessage> {
  const { text } = assistantSendRequest.parse(input);
  await respond("assistant-send");
  replyCount += 1;
  return {
    id: `reply_${replyCount}`,
    role: "assistant",
    text: `Here's a first pass at “${text.slice(0, 60)}”. This is a preview reply: Clipiro AI isn't connected yet.`,
    createdAt: new Date().toISOString(),
  };
}
