"use client";
import { Suspense, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ToolsSidebar from "@/app/components/ToolsSidebar";
import SidebarAccount from "@/app/components/SidebarAccount";
import { useVideoGenerate, getStoredToken } from "@/app/hooks/useVideoGenerate";
import { useAuth } from "@/app/components/AuthContext";

// ── Icons ─────────────────────────────────────────────────────────────────────
function IcChevron()      { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 18l6-6-6-6"/></svg>; }
function IcChevronLeft()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M15 18l-6-6 6-6"/></svg>; }
function IcChevronRight() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 5l7 7-7 7"/></svg>; }
function IcSparkle()      { return <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M12 2l1.9 5.6L19.5 9l-5.6 1.9L12 16l-1.9-5.1L4.5 9l5.6-1.4L12 2z"/></svg>; }
function IcCheck()        { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><path d="M5 13l4 4L19 7"/></svg>; }
function IcX()            { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12"/></svg>; }
function IcHeart()        { return <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>; }
function IcMessage()      { return <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm0-3h12v2H6V6zm0 6h9v2H6v-2z"/></svg>; }
function IcShare()        { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/></svg>; }
function IcMusic()        { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>; }
function IcPlay()         { return <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 ml-0.5"><path d="M4 2.5l9 5.5-9 5.5V2.5z" /></svg>; }
function IcSliders()      { return <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M3 5h2m0 0a2 2 0 004 0m-4 0a2 2 0 014 0m0 0h8M3 10h10m0 0a2 2 0 004 0m-4 0a2 2 0 014 0m0 0h0M3 15h4m0 0a2 2 0 004 0m-4 0a2 2 0 014 0m0 0h6" /></svg>; }

// ── Steps ─────────────────────────────────────────────────────────────────────
const STEPS = [
  { id: "script",   label: "Script"   },
  { id: "captions", label: "Captions" },
  { id: "video",   label: "Video"    },
  { id: "audio",   label: "Audio"    },
];

// ── ElevenLabs voice IDs ──────────────────────────────────────────────────────
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

let currentPreviewAudio: HTMLAudioElement | null = null;

// ── Backgrounds ───────────────────────────────────────────────────────────────
const BACKDROP_CDN = "https://gameplay-cdn.com/gameplay";
// Reads raw process.env rather than lib/env.ts's `env` object deliberately —
// this is a client component, and importing lib/env.ts here would bundle its
// whole zod schema (including server secrets) into client code.
const BACKGROUNDS_BASE =
  process.env.NEXT_PUBLIC_BACKGROUNDS_BASE ??
  "https://saas-video-editor-assets.s3.ap-south-1.amazonaws.com/backgrounds";

const BACKGROUND_FILE: Record<string, string> = {
  "Subway Surfers":    "subway-surfers.mp4",
  "Minecraft Parkour": "minecraft.mp4",
  "Minecraft Build":   "minecraft.mp4",
  "Soap Video":        "soap.mp4",
  "Slime Video":       "slime.mp4",
  "Sand Art":          "slime.mp4",
  "Kinetic Sand":      "slime.mp4",
  "Mario Kart":        "mario-kart.mp4",
  "Mario Kart GP":     "mario-kart.mp4",
  "GTA 5 Driving":     "subway-surfers.mp4",
  "GTA 5 City":        "subway-surfers.mp4",
  "Temple Run":        "subway-surfers.mp4",
  "Cooking ASMR":      "soap.mp4",
  "Basketball":        "subway-surfers.mp4",
  "Rocket League":     "mario-kart.mp4",
  "Beach Walk":        "subway-surfers.mp4",
  "Pressure Washing":  "soap.mp4",
};

function backgroundUrlFor(title: string) {
  return `${BACKGROUNDS_BASE}/${BACKGROUND_FILE[title] ?? "subway-surfers.mp4"}`;
}

const JAKEY   = "https://64.media.tumblr.com/8e073c3c73202376a83e782c25fc3012/163239d388b24cef-77/s640x960/a7ce4408f438a78ddc2e8011589a31c54215b2b8.jpg";
const SIR_SAT = "https://i.pinimg.com/736x/30/88/49/308849bbb361c64eb407cfb3be3aab4b.jpg";
const STEVE   = "https://minecraftpfp.com/api/pfp/null.png";
const MARIO   = "https://i.pinimg.com/736x/8a/79/5d/8a795df46777227e009cf7e3738ee07f.jpg";
const GORDO   = "https://i.pinimg.com/736x/61/de/f1/61def12f9e5e0e5c6c99745de38e99dd.jpg";
const APEX    = "https://i.pinimg.com/736x/aa/bb/cc/aabbcc1234567890abcdef1234567890.jpg";

const BACKGROUNDS = [
  { title: "Subway Surfers",    author: "Jakey",          authorImg: JAKEY,   mins: "2 mins",   size: "327 MB", tag: "Popular", id: "12dm7zdo-qhr4-9ro5-xb9p-794xmqsudvi" },
  { title: "Subway Surfers",    author: "Jakey",          authorImg: JAKEY,   mins: "3 mins",   size: "536 MB", tag: "Popular", id: "00eieqe3-po4g-rh90-888c-zriwtgl77k"   },
  { title: "Minecraft Parkour", author: "Steve",          authorImg: STEVE,   mins: "2 mins",   size: "84 MB",  tag: "Popular", id: "04k002fo-pf26-j5h1-v6ti-nxykcnf42"   },
  { title: "Minecraft Parkour", author: "Steve",          authorImg: STEVE,   mins: "2 mins",   size: "95 MB",  tag: "",        id: "1s739e44-vipb-57t9-5jqa-a14rqcc4upw"  },
  { title: "Minecraft Build",   author: "Steve",          authorImg: STEVE,   mins: "1.5 mins", size: "67 MB",  tag: "",        id: "2mn4pq8r-k3j7-8s2t-0w1e-r5y6u7i8o9p0" },
  { title: "Soap Video",        author: "Sir Satisfying", authorImg: SIR_SAT, mins: "1.0 mins", size: "93 MB",  tag: "",        id: "25r3klxv-8xnh-bx9z-0v5e-l02oj4wq85p" },
  { title: "Soap Video",        author: "Sir Satisfying", authorImg: SIR_SAT, mins: "1.0 mins", size: "94 MB",  tag: "",        id: "27yzpm7j-wlau-sx6d-hguk-85621eh5k89"  },
  { title: "Slime Video",       author: "Sir Satisfying", authorImg: SIR_SAT, mins: "0.9 mins", size: "204 MB", tag: "",        id: "0rbt0c54-ace8-8khb-nw6u-o6azecvjlzk"  },
  { title: "Sand Art",          author: "Sir Satisfying", authorImg: SIR_SAT, mins: "1.2 mins", size: "112 MB", tag: "",        id: "3kp9wz2e-1qas-7bcd-5efg-hijklmnop345"  },
  { title: "Kinetic Sand",      author: "Sir Satisfying", authorImg: SIR_SAT, mins: "1.5 mins", size: "180 MB", tag: "",        id: "5rs8vb3c-2wde-9fgh-6ijk-lmnopq4r567"  },
  { title: "Mario Kart",        author: "Mario",          authorImg: MARIO,   mins: "2 mins",   size: "309 MB", tag: "Popular", id: "2fg1tjdy-8ngb-xg29-tz1y-ze3h4vxeih"  },
  { title: "Mario Kart GP",     author: "Mario",          authorImg: MARIO,   mins: "1.5 mins", size: "245 MB", tag: "",        id: "7tu1opqr-3sde-0abc-4fgh-ijklmn8p901"  },
  { title: "GTA 5 Driving",     author: "Gordo",          authorImg: GORDO,   mins: "2 mins",   size: "412 MB", tag: "Popular", id: "9vw2xyza-4bcd-1efg-8hij-klmno56p789"  },
  { title: "GTA 5 City",        author: "Gordo",          authorImg: GORDO,   mins: "2.5 mins", size: "498 MB", tag: "",        id: "8ab3cdef-5ghi-2jkl-9mno-pqrst0u1234"  },
  { title: "Temple Run",        author: "Steve",          authorImg: STEVE,   mins: "1.5 mins", size: "128 MB", tag: "",        id: "1bcd2efg-6hij-3klm-0nop-qrstu7v8901"  },
  { title: "Cooking ASMR",      author: "Sir Satisfying", authorImg: SIR_SAT, mins: "2 mins",   size: "223 MB", tag: "",        id: "4efg5hij-7klm-4nop-1qrs-tuvwx2y3456"  },
  { title: "Basketball",        author: "Apex",           authorImg: APEX,    mins: "1.5 mins", size: "176 MB", tag: "",        id: "6hij7klm-8nop-5qrs-2tuv-wxyz3a4567"   },
  { title: "Rocket League",     author: "Apex",           authorImg: APEX,    mins: "2 mins",   size: "310 MB", tag: "",        id: "0klm1nop-9qrs-6tuv-3wxy-zabc4d5678"   },
  { title: "Beach Walk",        author: "Sir Satisfying", authorImg: SIR_SAT, mins: "2 mins",   size: "265 MB", tag: "Chill",   id: "2nop3qrs-0tuv-7wxy-4zab-cdef5g6789"   },
  { title: "Pressure Washing",  author: "Sir Satisfying", authorImg: SIR_SAT, mins: "1.2 mins", size: "143 MB", tag: "Chill",   id: "4qrs5tuv-1wxy-8zab-5cde-fghi6j7890"   },
];

// ── Subtitle styles ───────────────────────────────────────────────────────────
const OUTLINE = "1px 1px 0 #000,-1px 1px 0 #000,1px -1px 0 #000,-1px -1px 0 #000,0 2px 4px rgba(0,0,0,.5)";
const ONE_WORD_STYLES: CSSProperties[] = [
  { fontFamily: "system-ui,sans-serif", fontWeight: 800, color: "#fff", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 800, color: "#22d3ee", textShadow: OUTLINE },
  { fontFamily: "Georgia,serif", fontWeight: 700, color: "#fff", textShadow: "0 0 12px rgba(255,255,255,.6)" },
  { fontFamily: "Georgia,serif", fontWeight: 400, color: "#fff", textShadow: "0 0 14px rgba(255,255,255,.7)" },
  { fontFamily: "system-ui,sans-serif", fontWeight: 800, fontStyle: "italic", color: "#fff", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 900, color: "#fff", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 900, color: "#4ade80", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "Impact,system-ui,sans-serif", fontWeight: 900, fontStyle: "italic", color: "#fff", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 800, fontStyle: "italic", color: "#fff", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 900, color: "#fff", textTransform: "uppercase", background: "#ef4444", padding: "4px 18px", borderRadius: 9999 },
  { fontFamily: "Impact,system-ui,sans-serif", fontWeight: 900, color: "#fff", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 700, color: "#fff", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "Georgia,serif", fontWeight: 700, fontStyle: "italic", color: "#facc15", textShadow: "1px 1px 2px rgba(0,0,0,.6)" },
  { fontFamily: "Impact,system-ui,sans-serif", fontWeight: 900, fontStyle: "italic", color: "#facc15", textTransform: "uppercase", textShadow: "0 0 12px rgba(250,204,21,.8)" },
  { fontFamily: "system-ui,sans-serif", fontWeight: 900, color: "#facc15", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 900, color: "#3b82f6", textTransform: "uppercase", textShadow: "1px 1px 0 #fff,-1px 1px 0 #fff,1px -1px 0 #fff,-1px -1px 0 #fff" },
  { fontFamily: "system-ui,sans-serif", fontWeight: 900, color: "#fff", textTransform: "uppercase", background: "#7c3aed", padding: "4px 18px", borderRadius: 9999 },
  { fontFamily: "system-ui,sans-serif", fontWeight: 900, color: "#f97316", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "Impact,system-ui,sans-serif", fontWeight: 900, color: "#fff", textShadow: "0 0 16px rgba(34,211,238,.8),0 0 32px rgba(34,211,238,.5)" },
  { fontFamily: "system-ui,sans-serif", fontWeight: 900, color: "#ec4899", textTransform: "uppercase", textShadow: OUTLINE },
];
const LINE_STYLES: CSSProperties[] = [
  { fontFamily: "system-ui,sans-serif", fontWeight: 800, color: "#fff", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 800, color: "#fff", textShadow: "0 0 14px rgba(255,255,255,.7)" },
  { fontFamily: "Impact,system-ui,sans-serif", fontWeight: 900, fontStyle: "italic", color: "#3b82f6", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 700, color: "#1f2937", background: "#f3f4f6", padding: "4px 12px", borderRadius: 6 },
  { fontFamily: "Impact,system-ui,sans-serif", fontWeight: 900, color: "#fff", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "Georgia,serif", fontWeight: 700, color: "#facc15", textShadow: "0 0 12px rgba(250,204,21,.7)" },
  { fontFamily: "Impact,system-ui,sans-serif", fontWeight: 900, fontStyle: "italic", color: "#fff", textTransform: "uppercase", textShadow: "1px 1px 0 #ef4444,-1px -1px 0 #000" },
  { fontFamily: "system-ui,sans-serif", fontWeight: 900, color: "#facc15", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 800, color: "#fff", textTransform: "uppercase", background: "rgba(0,0,0,0.55)", padding: "3px 10px", borderRadius: 4 },
  { fontFamily: "Georgia,serif", fontWeight: 700, color: "#4ade80", textShadow: "0 0 10px rgba(74,222,128,.6)" },
  { fontFamily: "system-ui,sans-serif", fontWeight: 700, color: "#fff", background: "#2563eb", padding: "4px 12px", borderRadius: 6 },
  { fontFamily: "Impact,system-ui,sans-serif", fontWeight: 900, color: "#ec4899", textTransform: "uppercase", textShadow: OUTLINE },
];

// ── Voices ────────────────────────────────────────────────────────────────────
type Voice = { id: string; name: string; gender: "Male" | "Female"; age: string; accent: string };
const VOICES: Voice[] = [
  { id: "william",   name: "William",         gender: "Male",   age: "Middle aged", accent: "American"      },
  { id: "adam",      name: "Adam",            gender: "Male",   age: "Middle aged", accent: "American"      },
  { id: "dandan",    name: "Dan Dan",         gender: "Male",   age: "Middle aged", accent: "American"      },
  { id: "charlie",   name: "Charlie",         gender: "Male",   age: "Young",       accent: "Australian"    },
  { id: "clyde",     name: "Clyde",           gender: "Male",   age: "Middle aged", accent: "American"      },
  { id: "daniel",    name: "Daniel",          gender: "Male",   age: "Middle aged", accent: "British"       },
  { id: "ethan",     name: "Ethan",           gender: "Male",   age: "Young",       accent: "American"      },
  { id: "josh",      name: "Josh",            gender: "Male",   age: "Young",       accent: "American"      },
  { id: "liam",      name: "Liam",            gender: "Male",   age: "Young",       accent: "American"      },
  { id: "matthew",   name: "Matthew",         gender: "Male",   age: "Middle aged", accent: "American"      },
  { id: "patrick",   name: "Patrick",         gender: "Male",   age: "Middle aged", accent: "American"      },
  { id: "sam",       name: "Sam",             gender: "Male",   age: "Young",       accent: "American"      },
  { id: "thomas",    name: "Thomas",          gender: "Male",   age: "Old",         accent: "American"      },
  { id: "amir1",     name: "Amir #1",         gender: "Male",   age: "Young",       accent: "Middle Eastern"},
  { id: "spongebob", name: "Sponge Bob",      gender: "Male",   age: "Young",       accent: "Cartoon"       },
  { id: "natasha",   name: "Natasha",         gender: "Female", age: "Young",       accent: "American"      },
  { id: "alice",     name: "Alice",           gender: "Female", age: "Middle aged", accent: "British"       },
  { id: "aria",      name: "Aria",            gender: "Female", age: "Young",       accent: "American"      },
  { id: "bella",     name: "Bella",           gender: "Female", age: "Young",       accent: "American"      },
  { id: "charlotte", name: "Charlotte",       gender: "Female", age: "Young",       accent: "British"       },
  { id: "emily",     name: "Emily",           gender: "Female", age: "Young",       accent: "American"      },
  { id: "rachel",    name: "Rachel",          gender: "Female", age: "Middle aged", accent: "American"      },
  { id: "sarah",     name: "Sarah",           gender: "Female", age: "Young",       accent: "American"      },
  { id: "serena",    name: "Serena",          gender: "Female", age: "Middle aged", accent: "British"       },
];

// ── Music ─────────────────────────────────────────────────────────────────────
const MUSIC_BASE = "https://saas-video-editor-assets.s3.ap-south-1.amazonaws.com/music";
const BACKGROUND_MUSIC = [
  { name: "No background music",  slug: "",                    duration: ""       },
  { name: "Green to Blue",        slug: "green-to-blue",       duration: "3m 8s"  },
  { name: "Wii Shop Trap Theme",  slug: "wii-shop-trap-theme", duration: "1m 0s"  },
  { name: "Milk Cassette",        slug: "milk-cassette",       duration: "5m 8s"  },
  { name: "Bladerunner",          slug: "bladerunner",         duration: "3m 48s" },
  { name: "3am Walk",             slug: "3am-walk",            duration: "1m 0s"  },
  { name: "Lo-fi Chill",          slug: "lo-fi-chill",         duration: "4m 12s" },
  { name: "Phonk Drive",          slug: "phonk-drive",         duration: "2m 30s" },
  { name: "Epic Cinematic",       slug: "epic-cinematic",      duration: "3m 55s" },
  { name: "Sad Piano",            slug: "sad-piano",           duration: "2m 18s" },
  { name: "Motivational Rise",    slug: "motivational-rise",   duration: "2m 45s" },
  { name: "Dark Trap",            slug: "dark-trap",           duration: "1m 55s" },
];

// ── Voice settings ────────────────────────────────────────────────────────────
interface VoiceSettings { styleExaggeration: number; voiceStability: number; voiceVolume: number; voiceSpeed: number }
const DEFAULT_VS: VoiceSettings = { styleExaggeration: 60, voiceStability: 70, voiceVolume: 100, voiceSpeed: 115 };

// ── VoiceCard ─────────────────────────────────────────────────────────────────
function VoiceCard({ voice, selected, onSelect }: { voice: Voice; selected: boolean; onSelect: () => void }) {
  function handlePlay(e: React.MouseEvent) {
    e.stopPropagation();
    if (currentPreviewAudio) { currentPreviewAudio.pause(); currentPreviewAudio = null; }
    const audio = new Audio(EL_PREVIEW(voice.id));
    currentPreviewAudio = audio;
    audio.play().catch(() => {});
  }
  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-3 px-3.5 py-3 rounded-xl border cursor-pointer transition-all ${selected ? "border-orange-500 bg-orange-50" : "border-gray-200 bg-white hover:border-gray-300"}`}
      style={{ borderWidth: selected ? "2px" : "1px" }}
    >
      <button type="button" onClick={handlePlay}
        className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center flex-shrink-0 hover:bg-orange-600 transition-colors">
        <IcPlay />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{voice.name}</p>
        <div className="flex gap-1.5 mt-1 flex-wrap">
          <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md font-medium">{voice.gender}</span>
          <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md font-medium">{voice.age}</span>
          <span className="text-[10px] bg-orange-50 text-orange-600 px-2 py-0.5 rounded-md font-medium">{voice.accent}</span>
        </div>
      </div>
    </div>
  );
}

// ── VoiceColumn ───────────────────────────────────────────────────────────────
function VoiceColumn({ title, selected, onSelect }: { title: string; selected: string; onSelect: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const filtered = VOICES.filter(v =>
    v.name.toLowerCase().includes(search.toLowerCase()) || v.accent.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="9" cy="9" r="6" /><path d="M14 14l3 3" strokeLinecap="round" />
        </svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, accent…"
          className="w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3.5 py-2 text-sm focus:outline-none placeholder:text-gray-400" />
      </div>
      <div className="overflow-y-auto space-y-2 pr-0.5" style={{ maxHeight: "calc(100vh - 330px)" }}>
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No voices found</p>
        ) : filtered.map(v => (
          <VoiceCard key={v.id} voice={v} selected={selected === v.id} onSelect={() => onSelect(v.id)} />
        ))}
      </div>
    </div>
  );
}

// ── VoiceSettingsPanel ────────────────────────────────────────────────────────
function VoiceSettingsPanel({ settings, onChange, language, onLanguageChange }: {
  settings: VoiceSettings;
  onChange: (s: VoiceSettings) => void;
  language: string;
  onLanguageChange: (l: string) => void;
}) {
  const LANGS = [
    { code: "auto", label: "Auto Detect" },
    { code: "en",   label: "English"     },
    { code: "es",   label: "Spanish"     },
    { code: "fr",   label: "French"      },
    { code: "de",   label: "German"      },
    { code: "pt",   label: "Portuguese"  },
    { code: "hi",   label: "Hindi"       },
    { code: "ja",   label: "Japanese"    },
    { code: "ko",   label: "Korean"      },
    { code: "zh",   label: "Chinese"     },
    { code: "ar",   label: "Arabic"      },
  ];
  const sliders: { key: keyof VoiceSettings; label: string; min: number; max: number }[] = [
    { key: "styleExaggeration", label: "Style Exaggeration", min: 0,  max: 100 },
    { key: "voiceStability",    label: "Voice Stability",    min: 0,  max: 100 },
    { key: "voiceVolume",       label: "Voice Volume",       min: 0,  max: 100 },
    { key: "voiceSpeed",        label: "Voice Speed",        min: 50, max: 200 },
  ];
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IcSliders />
          <span className="text-sm font-bold text-gray-800">Voice Settings</span>
        </div>
        <button onClick={() => onChange(DEFAULT_VS)}
          className="text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors">
          Reset
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-bold text-gray-500 uppercase">Language</label>
        <select value={language} onChange={e => onLanguageChange(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none">
          {LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {sliders.map(({ key, label, min, max }) => (
          <div key={key}>
            <div className="flex justify-between mb-1.5">
              <span className="text-xs font-medium text-gray-600">{label}</span>
              <span className="text-xs font-bold text-gray-800">{settings[key]}{key === "voiceSpeed" ? "%" : ""}</span>
            </div>
            <input type="range" min={min} max={max} value={settings[key]}
              onChange={e => onChange({ ...settings, [key]: Number(e.target.value) })}
              className="w-full h-1.5 rounded-full accent-orange-500 cursor-pointer" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────
function Header({ stepIndex, onNext, onBack, onGenerate, canNext, canGenerate, isGenerating }: {
  stepIndex: number; onNext: () => void; onBack: () => void; onGenerate: () => void;
  canNext: boolean; canGenerate: boolean; isGenerating: boolean;
}) {
  return (
    <div className="px-8 pt-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-orange-500 flex items-center justify-center">
            <span className="text-white font-black text-lg leading-none">r</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Reddit Story Video</h1>
        </div>
        <SidebarAccount />
      </div>
      <div className="flex items-center justify-between mt-5">
        <nav className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                  style={{ background: i === stepIndex ? "#f97316" : "transparent", color: i === stepIndex ? "#fff" : "#9ca3af", border: i === stepIndex ? "none" : "1.5px solid #d1d5db" }}>
                  {i + 1}
                </span>
                <span className="text-sm font-semibold" style={{ color: i === stepIndex ? "#111827" : "#9ca3af" }}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <span className="text-gray-300 mx-1"><IcChevron /></span>}
            </div>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {stepIndex > 0 && (
            <button onClick={onBack} className="inline-flex items-center gap-1 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
              <IcChevronLeft /> Back
            </button>
          )}
          {stepIndex < STEPS.length - 1 ? (
            <button onClick={onNext} disabled={!canNext}
              className="inline-flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: canNext ? "#f97316" : "#fed7aa" }}>
              Next <IcChevronRight />
            </button>
          ) : (
            <button onClick={onGenerate} disabled={!canGenerate || isGenerating}
              className="inline-flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: canGenerate ? "#f97316" : "#fed7aa" }}>
              <IcSparkle /> Generate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── AI Script Modal ───────────────────────────────────────────────────────────
const AI_TONES = [
  { id: "informative", label: "📚 Informative" },
  { id: "funny",       label: "😂 Funny"       },
  { id: "dramatic",    label: "😱 Dramatic"    },
  { id: "serious",     label: "🎯 Serious"     },
  { id: "emotional",   label: "💔 Emotional"   },
  { id: "shocking",    label: "⚡ Shocking"    },
];

function AiScriptModal({ onClose, onResult }: {
  onClose: () => void;
  onResult: (data: { postTitle: string; script: string; username: string }) => void;
}) {
  const [tab,          setTab]          = useState<"reddit" | "ai">("reddit");
  const [redditUrl,    setRedditUrl]    = useState("");
  const [topic,        setTopic]        = useState("");
  const [tone,         setTone]         = useState("dramatic");
  const [loading,      setLoading]      = useState(false);
  const [scrapeError,  setScrapeError]  = useState<string | null>(null);
  const [genError,     setGenError]     = useState<string | null>(null);

  async function handleRedditFetch() {
    if (!redditUrl.trim()) return;
    setScrapeError(null);
    setLoading(true);
    try {
      const token = getStoredToken() || "";
      const res = await fetch("/api/generate/reddit-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: redditUrl }),
      });
      const data = await res.json() as { subreddit?: string; ups?: number; comments?: number; title?: string; selftext?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch post");
      onResult({
        postTitle: data.title ?? "",
        script:    data.selftext ?? data.title ?? "",
        username:  data.subreddit ?? "AskReddit",
      });
      onClose();
    } catch (err) {
      setScrapeError(err instanceof Error ? err.message : "Could not fetch that URL");
    } finally {
      setLoading(false);
    }
  }

  async function handleAiGenerate() {
    if (!topic.trim()) return;
    setGenError(null);
    setLoading(true);
    try {
      const token = getStoredToken() || "";
      const res = await fetch("/api/generate/reddit-video-script", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ topic, tone }),
      });
      const data = await res.json() as { postTitle?: string; script?: string; username?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      onResult({ postTitle: data.postTitle ?? "", script: data.script ?? "", username: data.username ?? "AskReddit" });
      onClose();
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Script generation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-gray-100" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-1.5"><IcSparkle /> Generate Script</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IcX /></button>
        </div>
        <div className="flex border-b border-gray-100">
          {(["reddit", "ai"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-all ${tab === t ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
              {t === "reddit" ? "Reddit URL" : "AI Generate"}
            </button>
          ))}
        </div>
        <div className="p-6">
          {tab === "reddit" ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1.5">Paste Reddit URL</label>
                <input value={redditUrl} onChange={e => setRedditUrl(e.target.value)}
                  placeholder="https://www.reddit.com/r/AskReddit/comments/…"
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-800 focus:outline-none" />
                <button onClick={() => setRedditUrl("https://www.reddit.com/r/AskReddit/comments/17yv7v8/what_scientific_breakthrough_are_we_closer_to/")}
                  className="text-xs text-orange-500 font-bold hover:underline mt-1 block">Use Example URL</button>
              </div>
              {scrapeError && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{scrapeError}</p>
              )}
              <button onClick={handleRedditFetch} disabled={loading || !redditUrl.trim()}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-all shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm">
                {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Fetching…</> : "Fetch Reddit Post"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1.5">Topic / Scenario</label>
                <textarea value={topic} onChange={e => setTopic(e.target.value)} rows={2}
                  placeholder="e.g. I found out my neighbor has been impersonating me online for years"
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-800 focus:outline-none resize-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-2">Tone</label>
                <div className="flex flex-wrap gap-2">
                  {AI_TONES.map(t => (
                    <button key={t.id} onClick={() => setTone(t.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${tone === t.id ? "bg-orange-500 border-orange-500 text-white" : "border-gray-200 text-gray-600 hover:border-orange-300"}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              {genError && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{genError}</p>
              )}
              <button onClick={handleAiGenerate} disabled={loading || !topic.trim()}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-all shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm">
                {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating…</> : <><IcSparkle /> Generate Script</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
function RedditVideoFlow() {
  const router       = useRouter();
  const params       = useSearchParams();
  const { openAuthModal } = useAuth();

  const stepParam  = params.get("step") || "script";
  const stepIndex  = Math.max(0, STEPS.findIndex(s => s.id === stepParam));

  // Script
  const [username,      setUsername]      = useState("AskReddit");
  const [upvotes,       setUpvotes]       = useState("14.2K");
  const [comments,      setComments]      = useState("980");
  const [postTitle,     setPostTitle]     = useState("");
  const [darkMode,      setDarkMode]      = useState(true);
  const [showIntroCard, setShowIntroCard] = useState(true);
  const [script,        setScript]        = useState("");

  // AI modal
  const [showModal,     setShowModal]     = useState(false);

  // Caption style
  const [subtitleMode,  setSubtitleMode]  = useState<"oneword" | "lines">("oneword");
  const [selectedStyle, setSelectedStyle] = useState(0);

  // Video
  const [selectedBg,    setSelectedBg]    = useState(0);
  const [bgFilter,      setBgFilter]      = useState("All");

  // Audio
  const [introVoice,    setIntroVoice]    = useState("william");
  const [scriptVoice,   setScriptVoice]   = useState("william");
  const [selectedMusic, setSelectedMusic] = useState(0);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(DEFAULT_VS);
  const [language,      setLanguage]      = useState("auto");

  const {
    status: genStatus, videoUrl, error: genError,
    progress: renderProgress, generateRedditVideo, reset: resetGenerate,
  } = useVideoGenerate();

  const isRendering  = genStatus === "rendering" || genStatus === "creating";
  const isCompleted  = genStatus === "completed";
  const isFailed     = genStatus === "failed";
  const isGenerating = isRendering;

  function goTo(i: number) { router.push(`/dashboard/create/reddit-video?step=${STEPS[i].id}`); }

  function loadSampleData() {
    setUsername("AskReddit");
    setUpvotes("14.2K");
    setComments("980");
    setPostTitle("What is a secret you will take to your grave?");
    setScript("When I was ten years old, I accidentally broke my dad's favorite vintage watch that he got from his grandfather. I was so scared that I buried it in the backyard. My parents spent weeks looking for it and eventually assumed it was lost at a restaurant. Ten years later, they sold the house and we moved. To this day, they still think it was stolen, and I've never had the courage to tell them.");
  }

  function handleGenerate() {
    const token = getStoredToken();
    if (!token) { openAuthModal("login", "Reddit Story Video"); return; }
    const chosenBg   = BACKGROUNDS[selectedBg];
    const bgVideoUrl = backgroundUrlFor(chosenBg.title);
    const track      = BACKGROUND_MUSIC[selectedMusic];
    const bgMusicUrl = track.slug ? `${MUSIC_BASE}/${track.slug}.mp3` : "";
    void generateRedditVideo({
      postTitle, username, script,
      introVoiceId: introVoice, scriptVoiceId: scriptVoice,
      bgMusicUrl, bgVideoUrl,
      subtitleStyleIndex: selectedStyle, subtitleMode,
      token,
      voiceSettings: {
        style:          voiceSettings.styleExaggeration / 100,
        stability:      voiceSettings.voiceStability / 100,
        similarityBoost: voiceSettings.voiceVolume / 100,
      },
      language: language === "auto" ? undefined : language,
      showIntroCard,
      darkMode,
      upvotes,
      comments,
    });
  }

  const BG_TAGS      = ["All", "Popular", "Chill", ...Array.from(new Set(BACKGROUNDS.map(b => b.author)))];
  const filteredBgs  = BACKGROUNDS.filter(b => {
    if (bgFilter === "All")     return true;
    if (bgFilter === "Popular") return b.tag === "Popular";
    if (bgFilter === "Chill")   return b.tag === "Chill";
    return b.author === bgFilter;
  });

  const canNext     = stepIndex === 0 ? (!!postTitle.trim() && !!script.trim()) : true;
  const canGenerate = !!script.trim() && !isGenerating;

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ToolsSidebar active="create" />
      <main className="flex-1 overflow-y-auto bg-white flex flex-col">
        <Header stepIndex={stepIndex} onNext={() => goTo(stepIndex + 1)} onBack={() => goTo(stepIndex - 1)}
          onGenerate={handleGenerate} canNext={canNext} canGenerate={canGenerate} isGenerating={isGenerating} />

        {/* ── Status banners (thin, non-blocking) ── */}
        {isRendering && (
          <div className="mx-8 mt-4 rounded-xl bg-blue-50 border border-blue-100 px-5 py-3 flex items-center gap-4">
            <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-blue-900">
                {genStatus === "creating" ? "Creating project…" : `Rendering your Reddit story video… ${renderProgress}%`}
              </p>
              <div className="mt-1.5 h-1.5 rounded-full bg-blue-100 overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${renderProgress}%` }} />
              </div>
            </div>
            <p className="text-xs text-blue-400 flex-shrink-0">You can keep editing below</p>
          </div>
        )}

        {isCompleted && videoUrl && (
          <div className="mx-8 mt-4 rounded-xl bg-green-50 border border-green-200 px-5 py-3 flex items-center gap-4">
            <span className="text-xl">🎉</span>
            <p className="flex-1 text-sm font-semibold text-green-900">Video ready!</p>
            <div className="flex items-center gap-2">
              <a href={videoUrl} download
                className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition-colors">
                Download
              </a>
              <button onClick={resetGenerate}
                className="inline-flex items-center gap-1.5 text-green-600 text-xs font-semibold hover:underline px-2">
                Dismiss
              </button>
            </div>
          </div>
        )}

        {isFailed && (
          <div className="mx-8 mt-4 rounded-xl bg-red-50 border border-red-200 px-5 py-3 flex items-center gap-4">
            <span className="text-xl">⚠️</span>
            <p className="flex-1 text-sm font-semibold text-red-800">{genError ?? "Render failed — please try again."}</p>
            <button onClick={resetGenerate}
              className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition-colors">
              Try Again
            </button>
            <button onClick={resetGenerate} className="text-red-400 hover:text-red-600"><IcX /></button>
          </div>
        )}

        <div className="flex-1">
          {/* ── Step 1: Script ── */}
          {stepIndex === 0 && (
            <div className="px-8 pt-6 pb-10 grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left: Controls */}
              <div className="bg-[#F7F7F7] border border-gray-100 rounded-[28px] p-6 flex flex-col space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-900">Story Setup</h2>
                  <div className="flex gap-2">
                    <button onClick={loadSampleData}
                      className="px-3.5 py-2 bg-white hover:bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl border border-gray-200 transition-colors">
                      Sample Data
                    </button>
                    <button onClick={() => setShowModal(true)}
                      className="px-3.5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-1.5 shadow">
                      <IcSparkle /> AI Script
                    </button>
                  </div>
                </div>

                {/* Metadata row */}
                <div className="grid grid-cols-3 gap-3">
                  {([
                    ["Username", username, setUsername] as const,
                    ["Upvotes",  upvotes,  setUpvotes]  as const,
                    ["Comments", comments, setComments] as const,
                  ] as const).map(([label, val, setter]) => (
                    <div key={String(label)} className="flex flex-col space-y-1">
                      <label className="text-[11px] font-bold text-gray-500 uppercase">{label}</label>
                      <input value={val} onChange={e => (setter as (v: string) => void)(e.target.value)}
                        className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none" />
                    </div>
                  ))}
                </div>

                {/* Post title */}
                <div className="flex flex-col space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-gray-500 uppercase">Post Title</label>
                    <span className="text-[10px] text-gray-400">{postTitle.length}/100</span>
                  </div>
                  <textarea rows={2} value={postTitle} onChange={e => setPostTitle(e.target.value.slice(0, 100))}
                    placeholder="Catchy Reddit post title…"
                    className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none resize-none" />
                </div>

                {/* Dark mode + intro card toggles */}
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setDarkMode(!darkMode)}
                    className={`py-3 rounded-xl border text-sm font-semibold transition-all ${darkMode ? "bg-zinc-900 border-zinc-900 text-white" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
                    {darkMode ? "🌙 Dark Mode" : "☀️ Light Mode"}
                  </button>
                  <button onClick={() => setShowIntroCard(!showIntroCard)}
                    className={`py-3 rounded-xl border text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${showIntroCard ? "bg-orange-50 border-orange-300 text-orange-700" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
                    Intro Card {showIntroCard && <IcCheck />}
                  </button>
                </div>

                {/* Script */}
                <div className="flex flex-col space-y-1.5 flex-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-gray-500 uppercase">Script Content</label>
                    <span className="text-[10px] text-gray-400">{script.split(/\s+/).filter(Boolean).length} words</span>
                  </div>
                  <textarea value={script} onChange={e => setScript(e.target.value)}
                    placeholder="Enter or generate your Reddit story script…"
                    className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-800 focus:outline-none resize-none"
                    style={{ minHeight: "140px" }} />
                </div>

                {/* Credit notice */}
                <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 flex justify-between items-center">
                  <div>
                    <p className="text-xs font-bold text-orange-900">2 credits per render</p>
                    <p className="text-[11px] text-orange-600 mt-0.5">Credits come with any plan. Need more? Get a top-up.</p>
                  </div>
                  <a href="/pricing" className="text-xs font-extrabold text-orange-600 hover:underline bg-white px-3.5 py-2 rounded-lg border border-orange-200 shadow-sm whitespace-nowrap">View plans</a>
                </div>
              </div>

              {/* Right: Live Preview */}
              <div className="flex flex-col space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2">Intro Card Preview</h3>
                  {showIntroCard ? (
                    <div className={`rounded-2xl p-5 border shadow-sm transition-colors ${darkMode ? "bg-[#1a1a1b] border-[#343536]" : "bg-white border-gray-200"}`}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-white font-black text-xl">r</div>
                        <div>
                          <div className={`font-bold text-sm ${darkMode ? "text-[#d7dadc]" : "text-gray-900"}`}>{username || "username"}</div>
                          <div className={`text-xs mt-0.5 ${darkMode ? "text-[#818384]" : "text-gray-400"}`}>u/{username.toLowerCase().replace(/\s/g, "_")} · Posted</div>
                        </div>
                      </div>
                      <p className={`text-base font-bold leading-snug mb-4 ${darkMode ? "text-[#d7dadc]" : "text-gray-900"}`}>
                        {postTitle || "Your post title will appear here…"}
                      </p>
                      <div className={`flex items-center gap-4 pt-3 border-t text-xs font-semibold ${darkMode ? "border-[#343536] text-[#818384]" : "border-gray-100 text-gray-500"}`}>
                        <span className="flex items-center gap-1.5 text-orange-500"><IcHeart /> {upvotes}</span>
                        <span className="flex items-center gap-1.5"><IcMessage /> {comments}</span>
                        <span className="flex items-center gap-1.5 ml-auto"><IcShare /> Share</span>
                      </div>
                    </div>
                  ) : (
                    <div className="h-[140px] rounded-2xl border border-dashed border-gray-200 flex items-center justify-center text-sm text-gray-400">Intro Card Hidden</div>
                  )}
                </div>
                <div className="flex flex-col space-y-2 flex-1">
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Script Preview</h3>
                  <div className="border border-gray-100 rounded-2xl bg-gray-50 p-5 overflow-y-auto text-sm text-gray-600 leading-relaxed font-mono" style={{ minHeight: "200px" }}>
                    {script || "Type or import a script to preview…"}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Captions ── */}
          {stepIndex === 1 && (
            <div className="px-8 pt-6 pb-10">
              <h2 className="text-lg font-bold text-gray-900">Select Caption Style</h2>
              <div className="flex items-center gap-3 mt-3 mb-5">
                <span className="text-sm font-medium" style={{ color: subtitleMode === "oneword" ? "#111827" : "#9ca3af" }}>One Word</span>
                <button
                  onClick={() => { setSubtitleMode(subtitleMode === "oneword" ? "lines" : "oneword"); setSelectedStyle(0); }}
                  className="relative w-10 h-5 rounded-full transition-colors"
                  style={{ background: subtitleMode === "lines" ? "#f97316" : "#cbd5e1" }}>
                  <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm" style={{ left: subtitleMode === "lines" ? "22px" : "2px" }} />
                </button>
                <span className="text-sm font-medium" style={{ color: subtitleMode === "lines" ? "#111827" : "#9ca3af" }}>Lines</span>
              </div>
              <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {(subtitleMode === "oneword" ? ONE_WORD_STYLES : LINE_STYLES).map((st, i) => {
                  const isSel = selectedStyle === i;
                  const sample = subtitleMode === "oneword" ? "Reddit" : "What would you do?";
                  return (
                    <button key={i} onClick={() => setSelectedStyle(i)}
                      className="group relative h-[104px] rounded-xl flex items-center justify-center px-4 transition-all overflow-hidden cursor-pointer"
                      style={{ background: "#1e293b", border: isSel ? "2px solid #f97316" : "2px solid transparent" }}>
                      {isSel && (
                        <span className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center shadow">
                          <IcCheck />
                        </span>
                      )}
                      <span className="text-[22px] leading-tight text-center group-hover:scale-110 transition-transform" style={st}>{sample}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Step 3: Background Video ── */}
          {stepIndex === 2 && (
            <div className="px-8 pt-6 pb-10">
              <h2 className="text-lg font-bold text-gray-900">Select Background Video</h2>
              <p className="text-sm text-gray-500 mt-1">Tip: you can swap the background after generation in the editor.</p>
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                {BG_TAGS.map(tag => (
                  <button key={tag} onClick={() => setBgFilter(tag)}
                    className="px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors"
                    style={{ background: bgFilter === tag ? "#f97316" : "#f3f4f6", color: bgFilter === tag ? "#fff" : "#4b5563" }}>
                    {tag}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 mt-5">
                {filteredBgs.map(b => {
                  const globalIdx = BACKGROUNDS.indexOf(b);
                  const isSel     = selectedBg === globalIdx;
                  const thumbUrl  = `${BACKDROP_CDN}/${b.id}/thumbnail.webp`;
                  return (
                    <div key={b.id} onClick={() => setSelectedBg(globalIdx)}
                      className="relative overflow-hidden rounded-lg border bg-white cursor-pointer transition-all"
                      style={{ borderColor: isSel ? "#f97316" : "#e5e7eb", borderWidth: isSel ? "2px" : "1px" }}>
                      {isSel && (
                        <div className="absolute left-3 top-3 z-30 h-5 w-5 rounded-full bg-orange-500 flex items-center justify-center text-white">
                          <IcCheck />
                        </div>
                      )}
                      {b.tag && (
                        <div className="absolute right-3 top-3 z-30 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{b.tag}</div>
                      )}
                      <div className="relative w-full overflow-hidden" style={{ height: "160px" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={thumbUrl} alt="" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                          className="absolute inset-0 h-full w-full object-cover blur-lg scale-110" />
                        <div className="absolute inset-0 bg-gradient-to-b from-slate-800/40 to-slate-900/60" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="relative h-full" style={{ aspectRatio: "9/16" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={thumbUrl} alt={b.title} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                              className="h-full w-full object-cover select-none" />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1.5 p-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-medium text-gray-900 truncate">{b.title}</h3>
                          <div className="flex items-center gap-1">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={b.authorImg} alt={b.author} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                              className="h-4 w-4 rounded-full object-cover" />
                            <p className="text-[10px] text-gray-600 truncate max-w-[60px]">{b.author}</p>
                          </div>
                        </div>
                        <div className="flex gap-1.5">
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700">{b.mins}</span>
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700">Free</span>
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700">{b.size}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Step 4: Audio ── */}
          {stepIndex === 3 && (
            <div className="mx-6 mt-4 mb-8 space-y-4">
              {/* Voice columns */}
              <div className="border border-gray-200 rounded-2xl overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
                  <div className="p-5">
                    <VoiceColumn title="Intro Voice" selected={introVoice} onSelect={setIntroVoice} />
                  </div>
                  <div className="p-5">
                    <VoiceColumn title="Script Voice" selected={scriptVoice} onSelect={setScriptVoice} />
                  </div>
                  {/* Music */}
                  <div className="p-5 flex flex-col gap-3">
                    <h3 className="text-sm font-bold text-gray-900">Background Music</h3>
                    <div className="overflow-y-auto space-y-2" style={{ maxHeight: "calc(100vh - 330px)" }}>
                      {BACKGROUND_MUSIC.map((m, i) => {
                        const isSel = selectedMusic === i;
                        return (
                          <div key={i} onClick={() => setSelectedMusic(i)}
                            className={`px-3.5 py-3 rounded-xl border cursor-pointer transition-all ${isSel ? "border-orange-400 bg-orange-50" : "border-gray-200 bg-white hover:border-gray-300"}`}
                            style={{ borderWidth: isSel ? "2px" : "1px" }}>
                            <div className="flex items-center gap-2.5">
                              <button type="button" onClick={e => {
                                e.stopPropagation();
                                if (m.slug) {
                                  if (currentPreviewAudio) { currentPreviewAudio.pause(); currentPreviewAudio = null; }
                                  const a = new Audio(`${MUSIC_BASE}/${m.slug}.mp3`);
                                  currentPreviewAudio = a;
                                  a.play().catch(() => {});
                                }
                              }} className="w-7 h-7 rounded-full border-2 border-orange-400 text-orange-500 flex items-center justify-center flex-shrink-0 hover:bg-orange-50 transition-colors">
                                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 ml-0.5"><path d="M4 2.5l9 5.5-9 5.5V2.5z" /></svg>
                              </button>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">{m.name}</p>
                              </div>
                              {m.duration && <span className="text-xs text-gray-400 flex-shrink-0">{m.duration}</span>}
                              <IcMusic />
                            </div>
                            {i > 0 && (
                              <div className="flex items-end gap-px h-5 mt-2">
                                {[4,8,14,20,10,18,12,16,22,14,8,19,12,15,20,11,17,9,21,13,16,10,18,14,8,12,20,15,11,17,9,22,13,16,8,14,20,10,18,12].map((h, j) => (
                                  <div key={j} className="flex-1 rounded-full transition-colors" style={{ height: `${h}px`, background: isSel ? "#f97316" : "#d1d5db" }} />
                                ))}
                              </div>
                            )}
                            {i === 0 && <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">Add your own music after generating in the editor</p>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Voice settings panel */}
              <VoiceSettingsPanel
                settings={voiceSettings}
                onChange={setVoiceSettings}
                language={language}
                onLanguageChange={setLanguage}
              />
            </div>
          )}
        </div>

        {/* ── AI Script Modal ── */}
        {showModal && (
          <AiScriptModal
            onClose={() => setShowModal(false)}
            onResult={({ postTitle: t, script: s, username: u }) => {
              if (t) setPostTitle(t);
              if (s) setScript(s);
              if (u) setUsername(u);
            }}
          />
        )}
      </main>
    </div>
  );
}

export default function RedditVideoPage() {
  return (
    <Suspense fallback={<div className="h-screen bg-white" />}>
      <RedditVideoFlow />
    </Suspense>
  );
}
