import {
  assistantSendRequest,
  homeSummarySchema,
  toolsResponseSchema,
  type AssistantCard,
  type AssistantMessage,
  type AssistantSendRequest,
  type AssistantStreamEvent,
  type HomeSummary,
  type Tool,
} from "@clipiro/shared";
import { ApiError, respond } from "./core";

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
  { id: "video-compressor", name: "Video Compressor", shortName: "Video Compressor", description: "Shrink a video file", category: "video", cost: { kind: "free" }, requiredTier: null, recommended: false },
  { id: "audio-balancer", name: "Audio Balancer", shortName: "Audio Balancer", description: "Even out loud and quiet parts", category: "audio", cost: { kind: "free" }, requiredTier: null, recommended: false },
  { id: "mp3-converter", name: "MP3 Converter", shortName: "MP3 Converter", description: "Turn a video into an MP3", category: "audio", cost: { kind: "free" }, requiredTier: null, recommended: false },
];

export async function getTools(): Promise<Tool[]> {
  const s = await respond("tools");
  return toolsResponseSchema.parse({ tools: s === "empty" ? [] : TOOLS }).tools;
}

// ── Clipiro AI (GET/POST/DELETE /assistant/messages) ─────────────────────
// Replies are picked by keyword and carry the same cards the server's tools
// make, from the project and asset mocks. The real stream is newline-
// delimited JSON (lib/assistant); assistantReply returns its events.

const INITIAL_HISTORY: AssistantMessage[] = [
  { id: "m1", role: "user", text: "Find the best hooks in my Ep. 42 podcast", createdAt: "2026-10-01T18:42:00+05:30" },
  {
    id: "m2",
    role: "assistant",
    text: "These four from **Founders Pod · Ep. 42** have the strongest hooks for Shorts.",
    createdAt: "2026-10-01T18:42:10+05:30",
    cards: [
      {
        type: "hooks",
        projectId: "founders-pod-ep-42",
        projectTitle: "Founders Pod · Ep. 42",
        clips: [
          { id: "clp_1", title: "Nobody tells you this part", score: 92, durationSec: 41, thumbnailUrl: "asset:creator-smile" },
          { id: "clp_2", title: "We almost shut down twice", score: 88, durationSec: 28, thumbnailUrl: "asset:founder-portrait" },
        ],
      },
    ],
  },
];
let HISTORY = INITIAL_HISTORY;
let USED = 0;
const DAILY = 20;
let seq = 0;

export function resetAssistantMocks() {
  HISTORY = INITIAL_HISTORY;
  USED = 0;
}
/** Tests: use up today's messages. */
export function useUpAssistant() {
  USED = DAILY;
}

export async function getAssistantHistory(): Promise<{ messages: AssistantMessage[]; remaining: number; limit: number }> {
  const s = await respond("assistant");
  return { messages: s === "empty" ? [] : HISTORY, remaining: Math.max(0, DAILY - USED), limit: DAILY };
}

export async function clearAssistant() {
  HISTORY = [];
}

/** POST /assistant/messages: the events the server would stream. */
export async function assistantReply(input: AssistantSendRequest): Promise<AssistantStreamEvent[]> {
  const { text } = assistantSendRequest.parse(input);
  await respond("assistant-send");
  if (USED >= DAILY) throw Object.assign(new ApiError(`You’ve sent today’s ${DAILY} messages to Clipiro AI. It resets in 24 hours.`, 429), { code: "assistant_limit" });
  USED += 1;
  const now = new Date().toISOString();
  const question: AssistantMessage = { id: `q${++seq}`, role: "user", text, createdAt: now };
  HISTORY = [...HISTORY, question];
  const q = text.toLowerCase();
  let reply: { text: string; status?: string; card?: AssistantCard };
  if (q.includes("hook")) {
    reply = {
      status: "Finding the strongest hooks…",
      text: "Your strongest hook is **Nobody tells you this part**.",
      card: {
        type: "hooks",
        projectId: "founders-pod-ep-42",
        projectTitle: "Founders Pod · Ep. 42",
        clips: [
          { id: "clp_1", title: "Nobody tells you this part", score: 92, durationSec: 41, thumbnailUrl: "asset:creator-smile" },
          { id: "clp_2", title: "We almost shut down twice", score: 88, durationSec: 28, thumbnailUrl: "asset:founder-portrait" },
        ],
      },
    };
  } else if (q.includes("caption")) {
    reply = { status: "Writing the caption…", text: "Here’s one you can post as it is.", card: { type: "caption", clipId: "clp_1", caption: "Nobody tells you this part of building a company.", hashtags: ["#founders", "#startup"] } };
  } else if (q.includes("time") || q.includes("when")) {
    reply = { status: "Checking when your audience is online…", text: "Your audience is most active Thursday afternoons.", card: { type: "best_time", provider: "youtube", at: "2026-10-15T10:30:00.000Z", label: "Thu around 4 PM", source: "audience" } };
  } else if (q.includes("autoclip") || q.includes("make clips")) {
    reply = { status: "Finding the video…", text: "Ready when you are.", card: { type: "autoclip", assetId: "a1", name: "Founders Pod · Ep. 42.mp4", durationSec: 3520, estimatedMinutes: 59 } };
  } else {
    reply = { text: "I can find hooks in a project, write captions, suggest a time to post, or set up AutoClip on a video." };
  }
  const answer: AssistantMessage = { id: `a${seq}`, role: "assistant", text: reply.text, createdAt: now, ...(reply.card ? { cards: [reply.card] } : {}) };
  HISTORY = [...HISTORY, answer];
  // The text arrives in two pieces, as a real stream would.
  const half = Math.ceil(reply.text.length / 2);
  return [
    { type: "user", message: question },
    ...(reply.status ? [{ type: "status" as const, label: reply.status }] : []),
    ...(reply.card ? [{ type: "card" as const, card: reply.card }] : []),
    { type: "text", delta: reply.text.slice(0, half) },
    { type: "text", delta: reply.text.slice(half) },
    { type: "done", message: answer, remaining: DAILY - USED },
  ];
}
