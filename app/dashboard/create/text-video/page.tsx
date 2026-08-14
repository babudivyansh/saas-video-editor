"use client";
import { Suspense, useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useVideoGenerate, getStoredToken } from "@/app/hooks/useVideoGenerate";
import { useAuth } from "@/app/components/AuthContext";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { AssetField } from "@/app/components/assets/AssetField";
import type { PickerAsset } from "@/app/components/assets/assetPickerData";

// ── Icons ─────────────────────────────────────────────────────────────────────
function IcChevron() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 18l6-6-6-6"/></svg>; }
function IcChevronLeft() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M15 18l-6-6 6-6"/></svg>; }
function IcArrowRight() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M5 12h14M12 5l7 7-7 7"/></svg>; }
function IcSparkle() { return <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M12 2l1.9 5.6L19.5 9l-5.6 1.9L12 16l-1.9-5.1L4.5 9l5.6-1.4L12 2z"/></svg>; }
function IcVideo() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>; }
function IcPhone() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.27 12a19.79 19.79 0 01-3.07-8.67A2 2 0 012.18 1h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.91 8.36a16 16 0 006.72 6.73l1.72-1.71a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>; }
function IcInfo() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>; }
function IcUpload() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>; }
function IcSwap() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>; }
function IcClipboard() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>; }
function IcTrash() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>; }
function IcUser() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>; }
function IcCheck() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><path d="M5 13l4 4L19 7"/></svg>; }
function IcMusic() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>; }

// Must match app/api/generate/text-video/route.ts's MAX_MESSAGES/MAX_MESSAGE_CHARS —
// each message costs one real ElevenLabs TTS call plus a rendered canvas frame
// for a flat charge, so this is a real cost cap, not just a UI nicety.
const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 500;

// ── Steps ─────────────────────────────────────────────────────────────────────
const STEPS = [
  { id: "script", label: "Script" },
  { id: "theme",  label: "Theme"  },
  { id: "video",  label: "Video"  },
  { id: "audio",  label: "Audio"  },
];

// ── Themes ────────────────────────────────────────────────────────────────────
interface Theme {
  id: string;
  label: string;
  bg: string;
  headerBg: string;
  headerText: string;
  receiverBubble: string;
  receiverText: string;
  senderBubble: string;
  senderText: string;
  wallpaper?: string;
  tick?: string;
}

const THEMES: Theme[] = [
  {
    id: "whatsapp-dark",
    label: "WhatsApp Dark",
    bg: "#0B141A",
    headerBg: "#1F2C34",
    headerText: "#E9EDEF",
    receiverBubble: "#1E2D34",
    receiverText: "#E9EDEF",
    senderBubble: "#005C4B",
    senderText: "#E9EDEF",
    tick: "#53BDEB",
  },
  {
    id: "whatsapp-light",
    label: "WhatsApp Light",
    bg: "#E5DDD5",
    headerBg: "#008069",
    headerText: "#fff",
    receiverBubble: "#ffffff",
    receiverText: "#111",
    senderBubble: "#D9FDD3",
    senderText: "#111",
    tick: "#53BDEB",
  },
  {
    id: "imessage-dark",
    label: "iMessage Dark",
    bg: "#1C1C1E",
    headerBg: "#1C1C1E",
    headerText: "#fff",
    receiverBubble: "#2C2C2E",
    receiverText: "#fff",
    senderBubble: "#147EFB",
    senderText: "#fff",
  },
  {
    id: "imessage-light",
    label: "iMessage Light",
    bg: "#F2F2F7",
    headerBg: "#F2F2F7",
    headerText: "#000",
    receiverBubble: "#E8E8EA",
    receiverText: "#000",
    senderBubble: "#147EFB",
    senderText: "#fff",
  },
  {
    id: "signal-dark",
    label: "Signal Dark",
    bg: "#1B1B1B",
    headerBg: "#2A2A2A",
    headerText: "#fff",
    receiverBubble: "#303030",
    receiverText: "#fff",
    senderBubble: "#2C6BED",
    senderText: "#fff",
  },
  {
    id: "signal-light",
    label: "Signal Light",
    bg: "#ffffff",
    headerBg: "#ffffff",
    headerText: "#000",
    receiverBubble: "#F0F0F0",
    receiverText: "#000",
    senderBubble: "#2C6BED",
    senderText: "#fff",
  },
  {
    id: "instagram-dm",
    label: "Instagram DM",
    bg: "#000000",
    headerBg: "#121212",
    headerText: "#ffffff",
    receiverBubble: "#262626",
    receiverText: "#ffffff",
    senderBubble: "#3797F0",
    senderText: "#ffffff",
  },
  {
    id: "telegram",
    label: "Telegram",
    bg: "#0F1014",
    headerBg: "#17212B",
    headerText: "#ffffff",
    receiverBubble: "#182533",
    receiverText: "#e6f0f3",
    senderBubble: "#2B5278",
    senderText: "#ffffff",
  },
];

// ── Background Videos ─────────────────────────────────────────────────────────
// Raw process.env below (not lib/env.ts's `env`) — this is a client component
// and importing lib/env.ts would bundle its server-secret schema into client code.
const BACKDROP_CDN = "https://gameplay-cdn.com/gameplay";
const BACKGROUNDS_BASE =
  process.env.NEXT_PUBLIC_BACKGROUNDS_BASE ??
  "https://saas-video-editor-assets.s3.ap-south-1.amazonaws.com/backgrounds";

const BACKGROUND_FILE: Record<string, string> = {
  "Subway Surfers": "subway-surfers.mp4",
  "Soap Video": "soap.mp4",
  "Minecraft Video": "minecraft.mp4",
  "Mario Kart": "mario-kart.mp4",
  "Slime Video": "slime.mp4",
};

function backgroundUrlFor(title: string): string {
  const file = BACKGROUND_FILE[title] ?? "subway-surfers.mp4";
  return `${BACKGROUNDS_BASE}/${file}`;
}
const JAKEY   = "https://64.media.tumblr.com/8e073c3c73202376a83e782c25fc3012/163239d388b24cef-77/s640x960/a7ce4408f438a78ddc2e8011589a31c54215b2b8.jpg";
const SIR_SAT = "https://i.pinimg.com/736x/30/88/49/308849bbb361c64eb407cfb3be3aab4b.jpg";
const STEVE   = "https://minecraftpfp.com/api/pfp/null.png";
const MARIO   = "https://i.pinimg.com/736x/8a/79/5d/8a795df46777227e009cf7e3738ee07f.jpg";

// Only the 5 backgrounds that have real S3-hosted video files
const BACKGROUNDS = [
  { title: "Subway Surfers",  author: "Jakey",          authorImg: JAKEY,   mins: "2 mins",   size: "327 MB", id: "12dm7zdo-qhr4-9ro5-xb9p-794xmqsudvi" },
  { title: "Soap Video",      author: "Sir Satisfying", authorImg: SIR_SAT, mins: "1.0 mins", size: "93 MB",  id: "25r3klxv-8xnh-bx9z-0v5e-l02oj4wq85p" },
  { title: "Minecraft Video", author: "Steve",          authorImg: STEVE,   mins: "2 mins",   size: "84 MB",  id: "04k002fo-pf26-j5h1-v6ti-nxykcnf42"   },
  { title: "Mario Kart",      author: "Mario",          authorImg: MARIO,   mins: "2 mins",   size: "309 MB", id: "2fg1tjdy-8ngb-xg29-tz1y-ze3h4vxeih"  },
  { title: "Slime Video",     author: "Sir Satisfying", authorImg: SIR_SAT, mins: "0.9 mins", size: "204 MB", id: "0rbt0c54-ace8-8khb-nw6u-o6azecvjlzk"  },
];

// ── Voices ────────────────────────────────────────────────────────────────────
// ElevenLabs voice IDs (mirrors utils/voice-ids.ts fallbacks) for preview URL generation
const EL_IDS: Record<string, string> = {
  william:   "VR6AewLTigWG4xSOukaG",
  adam:      "pNInz6obpgDQGcFmaJgB",
  dandan:    "TxGEqnHWrfWFTfGW9XjX",
  natasha:   "21m00Tcm4TlvDq8ikWAM",
  amir1:     "ZQe5CZNOzWyzPSCn5a3c",
  amir2:     "bVMeCyTHy58xNoL34h3p",
  spongebob: "jBpfuIE2acCO8z3wKNLl",
  charlie:   "yoZ06aMxZJJ28mfd3POQ",
  clyde:     "2EiwWnXFnvU5JabPnv8n",
  daniel:    "onwK4e9ZLuTAKqWW03F9",
  ethan:     "g5CIjZEefAph4nQFvHAz",
  josh:      "TxGEqnHWrfWFTfGW9XjX",
  rachel:    "21m00Tcm4TlvDq8ikWAM",
  sarah:     "EXAVITQu4vr4xnSDxMaL",
  alice:     "Xb7hH8MSUJpSbSDYk0k2",
  emily:     "LcfcDJNUP1GQjkzn1xUU",
  aria:      "9BWtsMINqrJLrRacOk9x",
  bella:     "EXAVITQu4vr4xnSDxMaL",
};
const EL_PREVIEW = (slug: string) =>
  `https://storage.googleapis.com/eleven-public-prod/premade/voices/${EL_IDS[slug] ?? ""}/preview.mp3`;

// Module-level audio ref so we stop the previous clip before playing a new one
let currentPreviewAudio: HTMLAudioElement | null = null;

interface Voice { id: string; name: string; gender: "Male" | "Female"; age: string; accent: string; desc: string; }

const VOICES: Voice[] = [
  { id: "william",  name: "William",       gender: "Male",   age: "Middle aged", accent: "English",      desc: "William is the default voice used in Crayo recommended for most use cases" },
  { id: "adam",     name: "Adam",          gender: "Male",   age: "Middle aged", accent: "Multilingual", desc: "Adam is one of the most recognizable voices used in many viral short-form videos" },
  { id: "dandan",   name: "Dan Dan",       gender: "Male",   age: "Middle aged", accent: "Multilingual", desc: "The AI voice used in Kimberly Shorts (100k+ yt channel by crayo)" },
  { id: "natasha",  name: "Natasha",       gender: "Female", age: "Young",       accent: "Multilingual", desc: "Natasha is the soft voice most notably used in viral short-form videos for female voices" },
  { id: "amir1",    name: "Amir #1",       gender: "Male",   age: "Young",       accent: "Multilingual", desc: "The one and only built-different sir Uber driver" },
  { id: "amir2",    name: "Amir #2 (Ameer)", gender: "Male", age: "Young",       accent: "Multilingual", desc: "Amir's brother who is rivaling on doordash" },
  { id: "spongebob",name: "Sponge Bob",    gender: "Male",   age: "Young",       accent: "Multilingual", desc: "Everyone's favorite fry cook from Bikini Bottom" },
  { id: "charlie",  name: "Charlie",       gender: "Male",   age: "Young",       accent: "English",      desc: "A young Australian voice with a bright and energetic tone" },
  { id: "clyde",    name: "Clyde",         gender: "Male",   age: "Middle aged", accent: "English",      desc: "Deep and authoritative American voice" },
  { id: "daniel",   name: "Daniel",        gender: "Male",   age: "Middle aged", accent: "English",      desc: "Classic British accent, professional and clear" },
  { id: "ethan",    name: "Ethan",         gender: "Male",   age: "Young",       accent: "English",      desc: "Young American voice, great for casual narration" },
  { id: "josh",     name: "Josh",          gender: "Male",   age: "Young",       accent: "English",      desc: "Friendly young American voice for storytelling" },
  { id: "rachel",   name: "Rachel",        gender: "Female", age: "Middle aged", accent: "English",      desc: "Calm and clear American female voice" },
  { id: "sarah",    name: "Sarah",         gender: "Female", age: "Young",       accent: "English",      desc: "Young and expressive American female voice" },
  { id: "alice",    name: "Alice",         gender: "Female", age: "Middle aged", accent: "English",      desc: "Sophisticated British female voice" },
  { id: "emily",    name: "Emily",         gender: "Female", age: "Young",       accent: "Multilingual", desc: "Versatile young voice perfect for emotional stories" },
  { id: "aria",     name: "Aria",          gender: "Female", age: "Middle aged", accent: "Multilingual", desc: "Smooth and professional multilingual voice" },
  { id: "bella",    name: "Bella",         gender: "Female", age: "Young",       accent: "English",      desc: "Soft and pleasant voice ideal for lifestyle content" },
];

// ── Background Music ──────────────────────────────────────────────────────────
const MUSIC_BASE =
  process.env.NEXT_PUBLIC_MUSIC_BASE ??
  "https://saas-video-editor-assets.s3.ap-south-1.amazonaws.com/music";

const BACKGROUND_MUSIC = [
  { name: "No background music", duration: "",      desc: "Add your own music after generating your video in the editor" },
  { name: "Green to Blue",       duration: "3m 8s",  desc: "waveform" },
  { name: "Wii Shop Trap Theme", duration: "1m 0s",  desc: "waveform" },
  { name: "Milk Cassette",       duration: "5m 8s",  desc: "waveform" },
  { name: "Bladerunner",         duration: "3m 48s", desc: "waveform" },
  { name: "3am Walk",            duration: "1m 0s",  desc: "waveform" },
  { name: "Fluffing Duck",       duration: "1m 7s",  desc: "waveform" },
  { name: "I was only temporary",duration: "1m 0s",  desc: "waveform" },
  { name: "Phonk Drive",         duration: "2m 30s", desc: "waveform" },
  { name: "Epic Cinematic",      duration: "3m 55s", desc: "waveform" },
  { name: "Sad Piano",           duration: "2m 18s", desc: "waveform" },
  { name: "Motivational Rise",   duration: "2m 40s", desc: "waveform" },
];

// ── Message types ─────────────────────────────────────────────────────────────
interface Msg { id: string; type: "receiver" | "sender"; text: string; }

// ── Chat Preview ──────────────────────────────────────────────────────────────
function ChatPreview({ name, profilePic, messages, theme }: {
  name: string; profilePic: string | null; messages: Msg[]; theme: Theme;
}) {
  const totalChars = messages.reduce((s, m) => s + m.text.length, 0);
  const estimatedSecs = Math.round(totalChars * 0.065);

  const isImessage = theme.id.startsWith("imessage");
  const isSignal = theme.id.startsWith("signal");

  return (
    <div className="flex-1 overflow-y-auto px-6 pt-4 pb-6">
      <p className="text-sm text-gray-500 mb-3">Message preview - {estimatedSecs}s estimated length</p>
      {/* Phone frame */}
      <div className="mx-auto rounded-2xl overflow-hidden border border-gray-200 shadow-lg" style={{ maxWidth: 280, background: theme.bg }}>
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: theme.headerBg }}>
          {isImessage || isSignal ? (
            <>
              <button className="text-blue-400 text-xs">‹</button>
              <div className="flex flex-col items-center flex-1">
                <div className="w-7 h-7 rounded-full overflow-hidden bg-gray-400 flex items-center justify-center flex-shrink-0">
                  {profilePic ? <img src={profilePic} alt="" className="w-full h-full object-cover" /> : <IcUser />}
                </div>
                <span className="text-[10px] font-semibold" style={{ color: theme.headerText }}>{name || "Contact"} ›</span>
              </div>
              {isImessage ? (
                <div className="flex gap-2">
                  <IcPhone /><IcVideo />
                </div>
              ) : (
                <div className="flex gap-2">
                  <IcPhone /><IcVideo /><IcInfo />
                </div>
              )}
            </>
          ) : (
            <>
              <button className="text-white text-xs">‹</button>
              <div className="w-7 h-7 rounded-full overflow-hidden bg-gray-400 flex items-center justify-center flex-shrink-0">
                {profilePic ? <img src={profilePic} alt="" className="w-full h-full object-cover" /> : <IcUser />}
              </div>
              <div className="flex-1">
                <p className="text-[11px] font-semibold" style={{ color: theme.headerText }}>{name || "Contact"}</p>
                <p className="text-[9px]" style={{ color: theme.headerText, opacity: 0.7 }}>online</p>
              </div>
              <IcVideo />
              <IcPhone />
            </>
          )}
        </div>
        {/* Messages */}
        <div className="p-3 space-y-2 min-h-[200px]">
          {messages.length === 0 ? (
            <p className="text-center text-[10px] opacity-40" style={{ color: theme.receiverText }}>Add messages below</p>
          ) : (
            messages.map(m => (
              <div key={m.id} className={`flex ${m.type === "sender" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[80%] px-2.5 py-1.5 rounded-2xl text-[11px] leading-snug"
                  style={{ background: m.type === "sender" ? theme.senderBubble : theme.receiverBubble,
                           color: m.type === "sender" ? theme.senderText : theme.receiverText,
                           borderRadius: m.type === "sender" ? "18px 18px 4px 18px" : "18px 18px 18px 4px" }}>
                  {m.text || <span className="opacity-40">…</span>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Theme Card ────────────────────────────────────────────────────────────────
function ThemeCard({ theme, selected, name, messages, onSelect }: {
  theme: Theme; selected: boolean; name: string; messages: Msg[]; onSelect: () => void;
}) {
  const sampleMsgs: Msg[] = messages.length > 0 ? messages.slice(0, 2) : [
    { id: "s1", type: "receiver", text: "would u love me if i was a tank?" },
    { id: "s2", type: "sender",   text: "well that depends on what tank you are..." },
  ];
  return (
    <div onClick={onSelect} className={`rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${selected ? "border-blue-500" : "border-transparent"}`}>
      <div className="p-0" style={{ background: theme.bg }}>
        {/* Mini header */}
        <div className="flex items-center gap-1.5 px-2 py-1.5" style={{ background: theme.headerBg }}>
          <button className="text-[10px]" style={{ color: theme.headerText }}>‹</button>
          <div className="w-5 h-5 rounded-full bg-gray-400" />
          <span className="text-[10px] font-semibold flex-1" style={{ color: theme.headerText }}>{name || "my bae <3"}</span>
          <IcVideo />
        </div>
        {/* Mini messages */}
        <div className="px-2 py-2 space-y-1.5" style={{ minHeight: 80 }}>
          {sampleMsgs.map(m => (
            <div key={m.id} className={`flex ${m.type === "sender" ? "justify-end" : "justify-start"}`}>
              <div className="max-w-[85%] px-2 py-1 text-[9px] leading-snug"
                style={{ background: m.type === "sender" ? theme.senderBubble : theme.receiverBubble,
                         color: m.type === "sender" ? theme.senderText : theme.receiverText,
                         borderRadius: "10px" }}>
                {m.text}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Voice Settings Panel ──────────────────────────────────────────────────────
interface VoiceSettings { styleExaggeration: number; voiceStability: number; voiceVolume: number; voiceSpeed: number; }
const DEFAULT_VS: VoiceSettings = { styleExaggeration: 40, voiceStability: 50, voiceVolume: 90, voiceSpeed: 60 };

function VoiceSettingsPanel({ settings, onChange, language, onLanguageChange }: {
  settings: VoiceSettings;
  onChange: (s: VoiceSettings) => void;
  language: string;
  onLanguageChange: (l: string) => void;
}) {
  const sliders: { key: keyof VoiceSettings; label: string }[] = [
    { key: "styleExaggeration", label: "Style Exaggeration" },
    { key: "voiceStability",    label: "Voice Stability"    },
    { key: "voiceVolume",       label: "Voice Volume"       },
    { key: "voiceSpeed",        label: "Voice Speed"        },
  ];
  return (
    <div className="flex flex-col gap-5">
      <h3 className="text-base font-bold text-gray-900">Language & Voice Settings</h3>
      {/* Language dropdown */}
      <select
        value={language}
        onChange={e => onLanguageChange(e.target.value)}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white text-gray-700 focus:outline-none"
      >
        <option value="auto">Auto Detect Language</option>
        <option value="en">English</option>
        <option value="es">Spanish</option>
        <option value="fr">French</option>
        <option value="de">German</option>
        <option value="pt">Portuguese</option>
        <option value="hi">Hindi</option>
        <option value="ja">Japanese</option>
        <option value="ko">Korean</option>
        <option value="zh">Chinese</option>
        <option value="ar">Arabic</option>
      </select>
      {/* Sliders */}
      {sliders.map(({ key, label }) => (
        <div key={key}>
          <div className="flex items-center gap-1 mb-2">
            <span className="text-sm font-semibold text-gray-800">{label}</span>
            <button className="text-gray-400 hover:text-gray-600"><IcInfo /></button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-6">Low</span>
            <input
              type="range" min={0} max={100} value={settings[key]}
              onChange={e => onChange({ ...settings, [key]: Number(e.target.value) })}
              className="flex-1 h-1.5 rounded-full accent-blue-600 cursor-pointer"
            />
            <span className="text-xs text-gray-400 w-8 text-right">High</span>
          </div>
        </div>
      ))}
      {/* Reset */}
      <button
        onClick={() => onChange(DEFAULT_VS)}
        className="w-full py-3 rounded-xl text-sm font-bold text-white transition-colors"
        style={{ background: "linear-gradient(90deg,#3b82f6,#6366f1)" }}
      >
        Reset To Default
      </button>
    </div>
  );
}

// ── Voice Card (Text Video style) ─────────────────────────────────────────────
function TvVoiceCard({ voice, selected, onSelect }: { voice: Voice; selected: boolean; onSelect: () => void }) {
  function handlePlay(e: React.MouseEvent) {
    e.stopPropagation();
    const previewUrl = EL_PREVIEW(voice.id);
    if (!previewUrl) return;
    if (currentPreviewAudio) {
      currentPreviewAudio.pause();
      currentPreviewAudio = null;
    }
    const audio = new Audio(previewUrl);
    currentPreviewAudio = audio;
    audio.play().catch(() => {});
  }

  return (
    <div
      onClick={onSelect}
      className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${selected ? "border-purple-500 bg-white" : "border-gray-200 bg-white hover:border-gray-300"}`}
      style={selected ? { borderWidth: "2px" } : { borderWidth: "1px" }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900">{voice.name}</p>
        <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{voice.desc}</p>
        <div className="flex gap-1.5 mt-1.5 flex-wrap">
          <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md font-medium">{voice.gender}</span>
          <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md font-medium">{voice.age}</span>
          <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-md font-medium">{voice.accent}</span>
        </div>
      </div>
      {/* Play preview button */}
      <button
        type="button"
        onClick={handlePlay}
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors mt-0.5"
        style={{ background: selected ? "#6366f1" : "#818cf8" }}
        title="Play voice preview"
      >
        <svg viewBox="0 0 16 16" fill="white" className="w-3.5 h-3.5 ml-0.5">
          <path d="M4 2.5l9 5.5-9 5.5V2.5z" />
        </svg>
      </button>
    </div>
  );
}

// ── Voice Column (Text Video style) ──────────────────────────────────────────
function TvVoiceColumn({ title, selected, onSelect }: { title: string; selected: string; onSelect: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const filtered = VOICES.filter(v =>
    v.name.toLowerCase().includes(search.toLowerCase()) || v.accent.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div className="flex flex-col gap-3 p-5 border-r border-gray-200">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-purple-100 flex items-center justify-center">
          <span className="text-purple-600 text-xs">◈</span>
        </div>
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      </div>
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="9" cy="9" r="6" /><path d="M14 14l3 3" strokeLinecap="round" />
        </svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, tag, etc."
          className="w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3.5 py-2 text-sm focus:outline-none placeholder:text-gray-400" />
      </div>
      <div className="overflow-y-auto space-y-2 pr-0.5" style={{ maxHeight: "calc(100vh - 300px)" }}>
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No voices found</p>
        ) : filtered.map(v => (
          <TvVoiceCard key={v.id} voice={v} selected={selected === v.id} onSelect={() => onSelect(v.id)} />
        ))}
      </div>
    </div>
  );
}

// ── AI Script Modal ───────────────────────────────────────────────────────────
type ScriptTone = "funny" | "dramatic" | "romantic" | "scary";

const TONE_OPTIONS: { id: ScriptTone; label: string; emoji: string }[] = [
  { id: "funny",    label: "Funny",    emoji: "😂" },
  { id: "dramatic", label: "Dramatic", emoji: "😱" },
  { id: "romantic", label: "Romantic", emoji: "💕" },
  { id: "scary",    label: "Scary",    emoji: "👻" },
];

function AiScriptModal({
  onClose,
  onGenerate,
  token,
}: {
  onClose: () => void;
  onGenerate: (msgs: Msg[]) => void;
  token: string;
}) {
  const [prompt, setPrompt] = useState("");
  const [tone, setTone] = useState<ScriptTone>("dramatic");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleGenerate() {
    if (!prompt.trim()) { setErr("Enter a topic first"); return; }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/generate/text-video-script", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: prompt.trim(), tone }),
      });
      const data = await res.json() as { messages?: { type: "receiver" | "sender"; text: string }[]; error?: string };
      if (!res.ok || data.error) { setErr(data.error ?? "Failed"); return; }
      const msgs: Msg[] = (data.messages ?? []).map(m => ({
        id: Date.now().toString() + Math.random().toString(36).slice(2),
        type: m.type,
        text: m.text,
      }));
      onGenerate(msgs);
    } catch {
      setErr("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <IcSparkle /> AI Script Generator
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1.5">
            What&apos;s the scenario?
          </label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="e.g. my girlfriend caught me texting my ex"
            rows={3}
            maxLength={500}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:border-blue-400 resize-none"
          />
          <p className="text-[10px] text-gray-400 mt-0.5 text-right">{prompt.length}/500</p>
        </div>

        <div>
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-2">
            Tone
          </label>
          <div className="grid grid-cols-4 gap-2">
            {TONE_OPTIONS.map(t => (
              <button
                key={t.id}
                onClick={() => setTone(t.id)}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 text-xs font-semibold transition-colors ${
                  tone === t.id
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                <span className="text-xl">{t.emoji}</span>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {err && <p className="text-sm text-red-600 font-semibold">{err}</p>}

        <button
          onClick={handleGenerate}
          disabled={loading}
          className={`w-full py-3 rounded-xl text-sm font-bold text-white transition-colors flex items-center justify-center gap-2 ${
            loading ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Generating script…
            </>
          ) : (
            <><IcSparkle /> Generate Script</>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
function TextVideoFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const { openAuthModal } = useAuth();
  const stepParam = params.get("step") || "script";
  const stepIndex = Math.max(0, STEPS.findIndex(s => s.id === stepParam));

  // Script state
  const [profilePic, setProfilePic] = useState<string | null>(null);
  // Set only when profilePic came from the Asset Library (an https URL we
  // already host) rather than a freshly-picked local file (a blob: URL) — lets
  // handleGenerate send avatarUrl and skip the base64 round-trip entirely.
  const [pickedAvatarAssetUrl, setPickedAvatarAssetUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [name, setName]             = useState("my bae <3");
  const [messages, setMessages]     = useState<Msg[]>([]);
  const [showScriptModal, setShowScriptModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Theme state
  const [selectedTheme, setSelectedTheme] = useState(3); // iMessage Light

  // Video state
  const [selectedBg, setSelectedBg] = useState(0);

  // Audio state
  const [receiverVoice, setReceiverVoice] = useState("william");
  const [narratorVoice, setNarratorVoice] = useState("william");
  const [selectedMusic, setSelectedMusic] = useState(0);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(DEFAULT_VS);
  const [language, setLanguage] = useState("auto");

  const { status: genStatus, videoUrl, error: genError, generateTextVideo, reset, progress: renderProgress } = useVideoGenerate();

  const fireReviewPrompt = useReviewPromptTrigger();
  const reviewPromptFiredRef = useRef(false);
  useEffect(() => {
    if (genStatus !== "completed" || !videoUrl || reviewPromptFiredRef.current) return;
    reviewPromptFiredRef.current = true;
    fireReviewPrompt("tool_generation_complete", { featureHint: "ai_tools" }).catch(() => { /* non-critical */ });
  }, [genStatus, videoUrl, fireReviewPrompt]);

  function goTo(i: number) { router.push(`/dashboard/create/text-video?step=${STEPS[i].id}`); }

  async function handleGenerate() {
    const token = getStoredToken();
    if (!token) { openAuthModal("login", "Fake Texts Video"); return; }
    if (!messages.length) { alert("Add at least one message to generate."); return; }
    const bg = BACKGROUNDS[selectedBg];
    const bgVideoUrl = backgroundUrlFor(bg.title);
    const bgMusicUrl = selectedMusic > 0
      ? `${MUSIC_BASE}/${BACKGROUND_MUSIC[selectedMusic].name.toLowerCase().replace(/\s+/g, "-")}.mp3`
      : "";
    const t = THEMES[selectedTheme];

    // A reused library asset is already hosted — send its URL directly and
    // skip the base64 round-trip; only a fresh local pick needs converting.
    let avatarBase64: string | undefined;
    const avatarUrl = pickedAvatarAssetUrl ?? undefined;
    if (!avatarUrl && profilePic && profilePic.startsWith("blob:")) {
      try {
        const resp = await fetch(profilePic);
        const buf = await resp.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        avatarBase64 = b64;
      } catch { /* skip avatar if conversion fails */ }
    }

    await generateTextVideo({
      contactName: name,
      messages: messages.map(m => ({ type: m.type, text: m.text })),
      theme: { id: t.id, bg: t.bg, headerBg: t.headerBg, headerText: t.headerText, receiverBubble: t.receiverBubble, receiverText: t.receiverText, senderBubble: t.senderBubble, senderText: t.senderText },
      bgVideoUrl,
      receiverVoiceId: receiverVoice,
      narratorVoiceId: narratorVoice,
      bgMusicUrl,
      voiceSettings: {
        stability: voiceSettings.voiceStability / 100,
        style: voiceSettings.styleExaggeration / 100,
        similarityBoost: 0.75,
      },
      language: language !== "auto" ? language : undefined,
      avatarBase64,
      avatarUrl,
      token,
    });
  }

  function addMessage(type: "receiver" | "sender") {
    setMessages(prev => {
      if (prev.length >= MAX_MESSAGES) {
        setMessagesError(`You can add up to ${MAX_MESSAGES} messages.`);
        return prev;
      }
      setMessagesError(null);
      return [...prev, { id: Date.now().toString(), type, text: "" }];
    });
  }
  function updateMessage(id: string, text: string) {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, text: text.slice(0, MAX_MESSAGE_CHARS) } : m));
  }
  function removeMessage(id: string) {
    setMessages(prev => prev.filter(m => m.id !== id));
  }
  function swapMessages() {
    setMessages(prev => prev.map(m => ({ ...m, type: m.type === "receiver" ? "sender" : "receiver" })));
  }
  function clearAll() {
    setMessages([]);
    setName("my bae <3");
    setProfilePic(null);
  }
  async function pasteText() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setMessages(prev => [...prev, { id: Date.now().toString(), type: "receiver", text }]);
    } catch { /* ignore */ }
  }
  function loadSample() {
    setName("my bae <3");
    setMessages([
      { id: "s1", type: "receiver", text: "would u love me if i was a tank?" },
      { id: "s2", type: "sender",   text: "well that depends on what tank you are..." },
    ]);
  }
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setAvatarError(null);
    if (!["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(f.type)) {
      setAvatarError("Only PNG, JPG, WEBP images are supported.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setAvatarError("Profile picture must be under 10 MB.");
      return;
    }
    const url = URL.createObjectURL(f);
    setProfilePic(url);
    setPickedAvatarAssetUrl(null);
  }

  function onAvatarAssetPicked(asset: PickerAsset) {
    setAvatarError(null);
    setProfilePic(asset.url);
    setPickedAvatarAssetUrl(asset.url);
  }

  const theme = THEMES[selectedTheme];
  const canNext = stepIndex === 0 ? (messages.length > 0) : true;

  return (
      <main className="h-full flex flex-col overflow-hidden">

        {/* ── Topbar ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center font-bold text-gray-700 text-lg">T</div>
            <h1 className="text-xl font-bold text-gray-900">Text Video</h1>
          </div>
        </div>

        {/* ── Step nav ── */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 flex-shrink-0">
          <nav className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2">
                <button
                  onClick={() => i < stepIndex && goTo(i)}
                  className={`flex items-center gap-1.5 text-sm font-semibold ${i === stepIndex ? "text-blue-600" : i < stepIndex ? "text-gray-600 hover:text-gray-800 cursor-pointer" : "text-gray-400 cursor-default"}`}
                >
                  <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${i === stepIndex ? "bg-blue-600 text-white" : i < stepIndex ? "bg-gray-200 text-gray-600" : "bg-gray-100 text-gray-400"}`}>
                    {i + 1}
                  </span>
                  {s.label}
                </button>
                {i < STEPS.length - 1 && <IcChevron />}
              </div>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button onClick={() => goTo(stepIndex - 1)}
                className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-800 px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                <IcChevronLeft /> Back
              </button>
            )}
            {stepIndex < STEPS.length - 1 ? (
              <button onClick={() => canNext && goTo(stepIndex + 1)}
                className={`flex items-center gap-1.5 text-sm font-semibold px-5 py-2 rounded-lg transition-colors ${canNext ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
                Next <IcChevron />
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={genStatus === "creating" || genStatus === "rendering"}
                className={`flex items-center gap-1.5 text-sm font-bold px-5 py-2 rounded-lg transition-colors ${genStatus === "creating" || genStatus === "rendering" ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white"}`}>
                {genStatus === "creating" ? "Creating…" : genStatus === "rendering" ? "Rendering…" : "Generate"} <IcArrowRight />
              </button>
            )}
          </div>
        </div>

        {/* ── Generation status banner ── */}
        {genStatus === "completed" && videoUrl && (
          <div className="flex items-center gap-3 px-6 py-3 bg-green-50 border-b border-green-200">
            <span className="text-sm font-semibold text-green-700">🎉 Video ready!</span>
            <a href={videoUrl} target="_blank" rel="noopener noreferrer"
              className="text-sm font-semibold text-blue-600 underline">Download / View</a>
            <button onClick={reset} className="ml-auto text-xs text-gray-400 hover:text-gray-600">Dismiss</button>
          </div>
        )}
        {genStatus === "failed" && genError && (
          <div className="flex items-center gap-3 px-6 py-3 bg-red-50 border-b border-red-200">
            <span className="text-sm font-semibold text-red-600">{genError}</span>
            <button onClick={reset} className="ml-auto text-xs text-gray-400 hover:text-gray-600">Dismiss</button>
          </div>
        )}
        {(genStatus === "rendering" || genStatus === "creating") && (
          <div className="flex items-center gap-3 px-6 py-3 bg-blue-50 border-b border-blue-200">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-semibold text-blue-700">
              {genStatus === "creating"
                ? "Creating project…"
                : renderProgress > 0
                  ? `Rendering your video… ${renderProgress}%`
                  : "Rendering your video — this takes a minute…"}
            </span>
            {genStatus === "rendering" && renderProgress > 0 && (
              <div className="flex-1 max-w-xs h-1.5 bg-blue-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${renderProgress}%` }}
                />
              </div>
            )}
          </div>
        )}

        {/* ── Content ── */}
        <div className="flex-1 overflow-hidden flex">

          {/* ── Step 1: Script ── */}
          {stepIndex === 0 && (
            <>
              {/* Left: Editor */}
              <div className="flex-1 flex flex-col border-r border-gray-100 overflow-hidden">
                {/* Panel header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                  <h2 className="text-sm font-bold text-gray-900">Text Script</h2>
                  <div className="flex items-center gap-1.5">
                    <button onClick={swapMessages}
                      className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
                      <IcSwap /> Swap
                    </button>
                    <button onClick={pasteText}
                      className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
                      <IcClipboard /> Paste
                    </button>
                    <button onClick={loadSample}
                      className="text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
                      Sample Data
                    </button>
                    <button
                      onClick={() => setShowScriptModal(true)}
                      className="flex items-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-3 py-1.5 transition-colors">
                      <IcSparkle /> AI script
                    </button>
                  </div>
                </div>
                {/* Upload profile + name */}
                <div className="px-5 py-4 border-b border-gray-100 space-y-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0 cursor-pointer border border-gray-200"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {profilePic
                        ? <img src={profilePic} alt="" className="w-full h-full object-cover" />
                        : <IcUser />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">Upload Profile Picture</p>
                      <p className="text-[11px] text-gray-400">Recommended: 400px × 400px, PNG or JPEG</p>
                    </div>
                    <button onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors flex-shrink-0">
                      <IcUpload /> Upload
                    </button>
                    <AssetField accept={["image"]} label="From Assets" size="sm" variant="secondary" onSelect={onAvatarAssetPicked} className="flex-shrink-0" />
                    <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFileChange} />
                  </div>
                  {avatarError && <p className="text-xs text-red-600 font-medium">{avatarError}</p>}
                  <div>
                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1">Enter a name</label>
                    <input value={name} onChange={e => setName(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-blue-400"
                      placeholder="Contact name…" />
                  </div>
                </div>
                {/* Messages list */}
                <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                  {messages.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-8">Add messages with the buttons below</p>
                  )}
                  {messages.length > 0 && (
                    <p className="text-[11px] text-gray-400 text-right">{messages.length}/{MAX_MESSAGES} messages</p>
                  )}
                  {messagesError && <p className="text-xs text-red-600 font-medium">{messagesError}</p>}
                  {messages.map(m => (
                    <div key={m.id} className={`flex items-center gap-2 ${m.type === "sender" ? "flex-row-reverse" : ""}`}>
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${m.type === "receiver" ? "bg-gray-400" : "bg-blue-500"}`} />
                      <input
                        value={m.text}
                        onChange={e => updateMessage(m.id, e.target.value)}
                        maxLength={MAX_MESSAGE_CHARS}
                        placeholder={m.type === "receiver" ? "Receiver message…" : "Sender message…"}
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                      />
                      <button onClick={() => removeMessage(m.id)} className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
                        <IcTrash />
                      </button>
                    </div>
                  ))}
                </div>
                {/* Bottom buttons */}
                <div className="flex items-center gap-2 px-5 py-3 border-t border-gray-100">
                  <button onClick={clearAll}
                    className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
                    <IcTrash /> Clear
                  </button>
                  <button onClick={() => addMessage("receiver")}
                    disabled={messages.length >= MAX_MESSAGES}
                    className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent">
                    + Add Receiver
                  </button>
                  <button onClick={() => addMessage("sender")}
                    disabled={messages.length >= MAX_MESSAGES}
                    className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent">
                    + Add Sender
                  </button>
                </div>
              </div>
              {/* Right: Live preview */}
              <ChatPreview name={name} profilePic={profilePic} messages={messages} theme={theme} />
            </>
          )}

          {/* ── Step 2: Theme ── */}
          {stepIndex === 1 && (
            <>
              <div className="flex-1 overflow-y-auto px-6 pt-6 pb-10">
                <h2 className="text-lg font-bold text-gray-900 mb-5">Choose theme</h2>
                <div className="grid grid-cols-2 gap-4 max-w-2xl">
                  {THEMES.map((t, i) => (
                    <ThemeCard
                      key={t.id}
                      theme={t}
                      selected={selectedTheme === i}
                      name={name}
                      messages={messages}
                      onSelect={() => setSelectedTheme(i)}
                    />
                  ))}
                </div>
              </div>
              <ChatPreview name={name} profilePic={profilePic} messages={messages} theme={theme} />
            </>
          )}

          {/* ── Step 3: Video ── */}
          {stepIndex === 2 && (
            <div className="flex-1 overflow-y-auto px-6 pt-6 pb-10">
              <h2 className="text-lg font-bold text-gray-900">Select Background Video</h2>
              <p className="text-sm text-gray-500 mt-1 mb-5">
                <span className="font-semibold text-gray-700">Tip:</span> You can replace the background video after generation in the editor.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {BACKGROUNDS.map((b, i) => {
                  const thumbUrl = `${BACKDROP_CDN}/${b.id}/thumbnail.webp`;
                  const isSel = selectedBg === i;
                  return (
                    <div key={i} onClick={() => setSelectedBg(i)}
                      className={`rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${isSel ? "border-blue-500" : "border-transparent"}`}>
                      {/* Thumbnail */}
                      <div className="relative bg-gray-100" style={{ paddingBottom: "177%" }}>
                        {isSel && (
                          <div className="absolute top-2 left-2 z-10 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                            <IcCheck />
                          </div>
                        )}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={thumbUrl} alt={b.title} className="absolute inset-0 w-full h-full object-cover" />
                      </div>
                      <div className="p-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-gray-900 truncate">{b.title}</h3>
                          <div className="flex items-center gap-1">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={b.authorImg} alt={b.author} className="h-4 w-4 rounded-full object-cover" />
                            <span className="text-[10px] text-gray-500 truncate max-w-[60px]">{b.author}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 text-[11px] text-gray-500">
                          <span>{b.mins}</span>
                          <span>{b.size}</span>
                          <span className="text-green-600 font-semibold">Free</span>
                        </div>
                        <button
                          type="button"
                          onClick={e => e.stopPropagation()}
                          className="w-full mt-1 py-1.5 rounded-lg border border-gray-200 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          View in Premium Gameplay
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Step 4: Audio ── */}
          {stepIndex === 3 && (
            <div className="flex-1 overflow-y-auto">
              <div className="border border-gray-200 rounded-2xl mx-6 my-4 overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
                  <TvVoiceColumn title="Select Receiver Voice" selected={receiverVoice} onSelect={setReceiverVoice} />
                  <TvVoiceColumn title="Select Narrator Voice" selected={narratorVoice} onSelect={setNarratorVoice} />
                  {/* Language & Voice Settings */}
                  <div className="p-5">
                    <VoiceSettingsPanel
                      settings={voiceSettings}
                      onChange={setVoiceSettings}
                      language={language}
                      onLanguageChange={setLanguage}
                    />
                    {/* Background Music */}
                    <div className="mt-6">
                      <h4 className="text-sm font-bold text-gray-900 mb-3">Background Music</h4>
                      <div className="space-y-2" style={{ maxHeight: "calc(100vh - 520px)", overflowY: "auto" }}>
                        {BACKGROUND_MUSIC.map((m, i) => {
                          const isSel = selectedMusic === i;
                          return (
                            <div key={i} onClick={() => setSelectedMusic(i)}
                              className={`px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${isSel ? "border-purple-500 bg-white" : "border-gray-200 hover:border-gray-300"}`}
                              style={isSel ? { borderWidth: "2px" } : { borderWidth: "1px" }}>
                              <div className="flex items-center gap-2">
                                <button type="button" onClick={e => e.stopPropagation()}
                                  className="w-6 h-6 rounded-full border-2 border-purple-400 text-purple-500 flex items-center justify-center flex-shrink-0 hover:bg-purple-50 transition-colors">
                                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5 ml-0.5">
                                    <path d="M4 2.5l9 5.5-9 5.5V2.5z" />
                                  </svg>
                                </button>
                                <span className="text-xs font-semibold text-gray-900 flex-1 truncate">{m.name}</span>
                                {m.duration && <span className="text-[10px] text-gray-400">{m.duration}</span>}
                                {i > 0 && <IcMusic />}
                              </div>
                              {i > 0 && (
                                <div className="flex items-end gap-px h-4 mt-1.5">
                                  {[4,8,14,10,18,12,16,22,14,8,9,12,15,20,11,7,9,21,13,16,10,8,14,20,10,18,12].map((h, j) => (
                                    <div key={j} className="flex-1 rounded-full" style={{ height: `${h}px`, background: isSel ? "#a855f7" : "#d1d5db" }} />
                                  ))}
                                </div>
                              )}
                              {i === 0 && <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">{m.desc}</p>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {showScriptModal && (
          <AiScriptModal
            onClose={() => setShowScriptModal(false)}
            onGenerate={(msgs) => { setMessages(msgs); setShowScriptModal(false); }}
            token={getStoredToken() ?? ""}
          />
        )}
      </main>
  );
}

export default function TextVideoPage() {
  return (
    <Suspense>
      <TextVideoFlow />
    </Suspense>
  );
}
