"use client";
import { Suspense, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ToolsSidebar from "@/app/components/ToolsSidebar";
import { useVideoGenerate, type GenerateStatus, getStoredToken } from "@/app/hooks/useVideoGenerate";

// ── Icons ────────────────────────────────────────────────────────────────────
function IcChevron() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 18l6-6-6-6"/></svg>; }
function IcChevronLeft() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M15 18l-6-6 6-6"/></svg>; }
function IcChevronRight() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 5l7 7-7 7"/></svg>; }
function IcZap() { return <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>; }
function IcSparkle() { return <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M12 2l1.9 5.6L19.5 9l-5.6 1.9L12 16l-1.9-5.1L4.5 9l5.6-1.4L12 2z"/></svg>; }
function IcDiscord() { return <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>; }
function IcCheck() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><path d="M5 13l4 4L19 7"/></svg>; }
function IcX() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12"/></svg>; }
function IcHeart() { return <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>; }
function IcMessage() { return <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm0-3h12v2H6V6zm0 6h9v2H6v-2z"/></svg>; }
function IcShare() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/></svg>; }
function IcVolume() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>; }
function IcMusic() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>; }

// ── Step definitions ─────────────────────────────────────────────────────────
const STEPS = [
  { id: "script", label: "Script" },
  { id: "style", label: "Style" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
];

// ── Background Videos ────────────────────────────────────────────────────────
const BACKDROP_CDN = "https://gameplay-cdn.com/gameplay";
const JAKEY   = "https://64.media.tumblr.com/8e073c3c73202376a83e782c25fc3012/163239d388b24cef-77/s640x960/a7ce4408f438a78ddc2e8011589a31c54215b2b8.jpg";
const SIR_SAT = "https://i.pinimg.com/736x/30/88/49/308849bbb361c64eb407cfb3be3aab4b.jpg";
const STEVE   = "https://minecraftpfp.com/api/pfp/null.png";
const MARIO   = "https://i.pinimg.com/736x/8a/79/5d/8a795df46777227e009cf7e3738ee07f.jpg";
const GORDO   = "https://i.pinimg.com/736x/61/de/f1/61def12f9e5e0e5c6c99745de38e99dd.jpg";
const APEX    = "https://i.pinimg.com/736x/aa/bb/cc/aabbcc1234567890abcdef1234567890.jpg";

const BACKGROUNDS = [
  // Subway Surfers
  { title: "Subway Surfers",    author: "Jakey",          authorImg: JAKEY,   mins: "2 mins",   size: "327 MB", tag: "Popular", id: "12dm7zdo-qhr4-9ro5-xb9p-794xmqsudvi" },
  { title: "Subway Surfers",    author: "Jakey",          authorImg: JAKEY,   mins: "3 mins",   size: "536 MB", tag: "Popular", id: "00eieqe3-po4g-rh90-888c-zriwtgl77k"   },
  // Minecraft
  { title: "Minecraft Parkour", author: "Steve",          authorImg: STEVE,   mins: "2 mins",   size: "84 MB",  tag: "Popular", id: "04k002fo-pf26-j5h1-v6ti-nxykcnf42"   },
  { title: "Minecraft Parkour", author: "Steve",          authorImg: STEVE,   mins: "2 mins",   size: "95 MB",  tag: "",        id: "1s739e44-vipb-57t9-5jqa-a14rqcc4upw"  },
  { title: "Minecraft Build",   author: "Steve",          authorImg: STEVE,   mins: "1.5 mins", size: "67 MB",  tag: "",        id: "2mn4pq8r-k3j7-8s2t-0w1e-r5y6u7i8o9p0" },
  // Satisfying / ASMR
  { title: "Soap Video",        author: "Sir Satisfying", authorImg: SIR_SAT, mins: "1.0 mins", size: "93 MB",  tag: "",        id: "25r3klxv-8xnh-bx9z-0v5e-l02oj4wq85p" },
  { title: "Soap Video",        author: "Sir Satisfying", authorImg: SIR_SAT, mins: "1.0 mins", size: "94 MB",  tag: "",        id: "27yzpm7j-wlau-sx6d-hguk-85621eh5k89"  },
  { title: "Slime Video",       author: "Sir Satisfying", authorImg: SIR_SAT, mins: "0.9 mins", size: "204 MB", tag: "",        id: "0rbt0c54-ace8-8khb-nw6u-o6azecvjlzk"  },
  { title: "Sand Art",          author: "Sir Satisfying", authorImg: SIR_SAT, mins: "1.2 mins", size: "112 MB", tag: "",        id: "3kp9wz2e-1qas-7bcd-5efg-hijklmnop345"  },
  { title: "Kinetic Sand",      author: "Sir Satisfying", authorImg: SIR_SAT, mins: "1.5 mins", size: "180 MB", tag: "",        id: "5rs8vb3c-2wde-9fgh-6ijk-lmnopq4r567"  },
  // Mario Kart
  { title: "Mario Kart",        author: "Mario",          authorImg: MARIO,   mins: "2 mins",   size: "309 MB", tag: "Popular", id: "2fg1tjdy-8ngb-xg29-tz1y-ze3h4vxeih"  },
  { title: "Mario Kart GP",     author: "Mario",          authorImg: MARIO,   mins: "1.5 mins", size: "245 MB", tag: "",        id: "7tu1opqr-3sde-0abc-4fgh-ijklmn8p901"  },
  // GTA 5
  { title: "GTA 5 Driving",     author: "Gordo",          authorImg: GORDO,   mins: "2 mins",   size: "412 MB", tag: "Popular", id: "9vw2xyza-4bcd-1efg-8hij-klmno56p789"  },
  { title: "GTA 5 City",        author: "Gordo",          authorImg: GORDO,   mins: "2.5 mins", size: "498 MB", tag: "",        id: "8ab3cdef-5ghi-2jkl-9mno-pqrst0u1234"  },
  // Other
  { title: "Temple Run",        author: "Steve",          authorImg: STEVE,   mins: "1.5 mins", size: "128 MB", tag: "",        id: "1bcd2efg-6hij-3klm-0nop-qrstu7v8901"  },
  { title: "Cooking ASMR",      author: "Sir Satisfying", authorImg: SIR_SAT, mins: "2 mins",   size: "223 MB", tag: "",        id: "4efg5hij-7klm-4nop-1qrs-tuvwx2y3456"  },
  { title: "Basketball",        author: "Apex",           authorImg: APEX,    mins: "1.5 mins", size: "176 MB", tag: "",        id: "6hij7klm-8nop-5qrs-2tuv-wxyz3a4567"   },
  { title: "Rocket League",     author: "Apex",           authorImg: APEX,    mins: "2 mins",   size: "310 MB", tag: "",        id: "0klm1nop-9qrs-6tuv-3wxy-zabc4d5678"   },
  { title: "Beach Walk",        author: "Sir Satisfying", authorImg: SIR_SAT, mins: "2 mins",   size: "265 MB", tag: "Chill",   id: "2nop3qrs-0tuv-7wxy-4zab-cdef5g6789"   },
  { title: "Pressure Washing",  author: "Sir Satisfying", authorImg: SIR_SAT, mins: "1.2 mins", size: "143 MB", tag: "Chill",   id: "4qrs5tuv-1wxy-8zab-5cde-fghi6j7890"   },
];

// ── Subtitle styles ──────────────────────────────────────────────────────────
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

// ── Voices ───────────────────────────────────────────────────────────────────
type Voice = { id: string; name: string; gender: "Male" | "Female"; age: string; lang: string; accent: string };

const VOICES: Voice[] = [
  // Male
  { id: "william",    name: "William",           gender: "Male",   age: "Middle aged", lang: "English",      accent: "American"     },
  { id: "adam",       name: "Adam",              gender: "Male",   age: "Middle aged", lang: "Multilingual", accent: "American"     },
  { id: "dandan",     name: "Dan Dan",           gender: "Male",   age: "Middle aged", lang: "Multilingual", accent: "American"     },
  { id: "charlie",    name: "Charlie",           gender: "Male",   age: "Young",       lang: "English",      accent: "Australian"   },
  { id: "clyde",      name: "Clyde",             gender: "Male",   age: "Middle aged", lang: "English",      accent: "American"     },
  { id: "daniel",     name: "Daniel",            gender: "Male",   age: "Middle aged", lang: "English",      accent: "British"      },
  { id: "dave",       name: "Dave",              gender: "Male",   age: "Old",         lang: "English",      accent: "British"      },
  { id: "ethan",      name: "Ethan",             gender: "Male",   age: "Young",       lang: "English",      accent: "American"     },
  { id: "fin",        name: "Fin",               gender: "Male",   age: "Young",       lang: "English",      accent: "Irish"        },
  { id: "harry",      name: "Harry",             gender: "Male",   age: "Young",       lang: "English",      accent: "British"      },
  { id: "josh",       name: "Josh",              gender: "Male",   age: "Young",       lang: "English",      accent: "American"     },
  { id: "liam",       name: "Liam",              gender: "Male",   age: "Young",       lang: "English",      accent: "American"     },
  { id: "matthew",    name: "Matthew",           gender: "Male",   age: "Middle aged", lang: "English",      accent: "American"     },
  { id: "patrick",    name: "Patrick",           gender: "Male",   age: "Middle aged", lang: "English",      accent: "American"     },
  { id: "sam",        name: "Sam",               gender: "Male",   age: "Young",       lang: "English",      accent: "American"     },
  { id: "thomas",     name: "Thomas",            gender: "Male",   age: "Old",         lang: "English",      accent: "American"     },
  { id: "amir1",      name: "Amir #1",           gender: "Male",   age: "Young",       lang: "Multilingual", accent: "Middle Eastern"},
  { id: "amir2",      name: "Amir #2 (Ameer)",   gender: "Male",   age: "Young",       lang: "Multilingual", accent: "Middle Eastern"},
  { id: "spongebob",  name: "Sponge Bob",        gender: "Male",   age: "Young",       lang: "Multilingual", accent: "Cartoon"      },
  { id: "arnold",     name: "Arnold",            gender: "Male",   age: "Middle aged", lang: "English",      accent: "Austrian"     },
  { id: "ryan",       name: "Ryan",              gender: "Male",   age: "Young",       lang: "English",      accent: "American"     },
  { id: "george",     name: "George",            gender: "Male",   age: "Middle aged", lang: "English",      accent: "British"      },
  // Female
  { id: "natasha",    name: "Natasha",           gender: "Female", age: "Young",       lang: "Multilingual", accent: "American"     },
  { id: "alice",      name: "Alice",             gender: "Female", age: "Middle aged", lang: "English",      accent: "British"      },
  { id: "aria",       name: "Aria",              gender: "Female", age: "Young",       lang: "English",      accent: "American"     },
  { id: "bella",      name: "Bella",             gender: "Female", age: "Young",       lang: "English",      accent: "American"     },
  { id: "charlotte",  name: "Charlotte",         gender: "Female", age: "Young",       lang: "English",      accent: "British"      },
  { id: "domi",       name: "Domi",              gender: "Female", age: "Young",       lang: "English",      accent: "American"     },
  { id: "elli",       name: "Elli",              gender: "Female", age: "Young",       lang: "English",      accent: "American"     },
  { id: "emily",      name: "Emily",             gender: "Female", age: "Young",       lang: "English",      accent: "American"     },
  { id: "freya",      name: "Freya",             gender: "Female", age: "Young",       lang: "English",      accent: "American"     },
  { id: "grace",      name: "Grace",             gender: "Female", age: "Young",       lang: "English",      accent: "American"     },
  { id: "matilda",    name: "Matilda",           gender: "Female", age: "Young",       lang: "English",      accent: "American"     },
  { id: "rachel",     name: "Rachel",            gender: "Female", age: "Middle aged", lang: "English",      accent: "American"     },
  { id: "sarah",      name: "Sarah",             gender: "Female", age: "Young",       lang: "English",      accent: "American"     },
  { id: "serena",     name: "Serena",            gender: "Female", age: "Middle aged", lang: "English",      accent: "British"      },
  { id: "nicole",     name: "Nicole",            gender: "Female", age: "Young",       lang: "English",      accent: "American"     },
  { id: "jessica",    name: "Jessica",           gender: "Female", age: "Young",       lang: "English",      accent: "American"     },
];

// ── Background Music ─────────────────────────────────────────────────────────
const BACKGROUND_MUSIC = [
  { name: "No background music",  desc: "Add your own music after generating in the editor", duration: "" },
  { name: "Green to Blue",        desc: "waveform", duration: "3m 8s"  },
  { name: "Wii Shop Trap Theme",  desc: "waveform", duration: "1m 0s"  },
  { name: "Milk Cassette",        desc: "waveform", duration: "5m 8s"  },
  { name: "Bladerunner",          desc: "waveform", duration: "3m 48s" },
  { name: "3am Walk",             desc: "waveform", duration: "1m 0s"  },
  { name: "Lo-fi Chill",          desc: "waveform", duration: "4m 12s" },
  { name: "Phonk Drive",          desc: "waveform", duration: "2m 30s" },
  { name: "Epic Cinematic",       desc: "waveform", duration: "3m 55s" },
  { name: "Sad Piano",            desc: "waveform", duration: "2m 18s" },
  { name: "Motivational Rise",    desc: "waveform", duration: "2m 45s" },
  { name: "Dark Trap",            desc: "waveform", duration: "1m 55s" },
];

// ── Generating Overlay ────────────────────────────────────────────────────────
function GeneratingOverlay({ status, videoUrl, error, onReset }: { status: GenerateStatus; videoUrl: string | null; error: string | null; onReset: () => void }) {
  const statusText: Partial<Record<GenerateStatus, string>> = {
    uploading: "Uploading script components…",
    creating: "Creating your project…",
    rendering: "Rendering your Reddit Story video — this may take 2–5 minutes…",
  };
  if (status === "completed" && videoUrl) {
    return (
      <div className="mt-4 mx-8 mb-8 rounded-[28px] bg-gray-50 border border-gray-100 flex items-center justify-center" style={{ minHeight: "calc(100vh - 200px)" }}>
        <div className="w-full max-w-sm flex flex-col items-center gap-5 p-6 text-center">
          <h2 className="text-xl font-bold text-gray-900">Your video is ready!</h2>
          <video src={videoUrl} controls className="w-full rounded-xl shadow-lg max-h-64 object-contain" />
          <div className="flex gap-3 w-full">
            <a href={videoUrl} download className="flex-1 inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">Download</a>
            <button onClick={onReset} className="flex-1 inline-flex items-center justify-center border border-gray-200 text-gray-700 text-sm font-semibold py-2.5 rounded-lg hover:bg-gray-50 transition-colors">Create Another</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-4 mx-8 mb-8 rounded-[28px] bg-gray-50 border border-gray-100 flex items-center justify-center" style={{ minHeight: "calc(100vh - 200px)" }}>
      <div className="flex flex-col items-center gap-4 p-8 text-center">
        {status === "failed" ? (
          <>
            <p className="text-gray-700 font-medium">{error ?? "Something went wrong."}</p>
            <button onClick={onReset} className="mt-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors">Try Again</button>
          </>
        ) : (
          <>
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-gray-700 font-medium">{statusText[status] ?? ""}</p>
            {status === "rendering" && <p className="text-sm text-gray-400">You can leave this page — we&apos;ll keep processing.</p>}
          </>
        )}
      </div>
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────
function Header({ stepIndex, onNext, onBack, onGenerate, canNext, canGenerate, isGenerating }: {
  stepIndex: number; onNext: () => void; onBack: () => void; onGenerate: () => void;
  canNext: boolean; canGenerate: boolean; isGenerating: boolean;
}) {
  return (
    <div className="px-8 pt-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center">
            <span className="text-orange-500 font-bold text-lg">r</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Reddit Video</h1>
        </div>
        <div className="flex items-center gap-4">
          <a href="/discord" aria-label="Discord" className="text-[#5865F2]"><IcDiscord /></a>
        </div>
      </div>
      <div className="flex items-center justify-between mt-5">
        <nav className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                  style={{ background: i === stepIndex ? "#2563eb" : "transparent", color: i === stepIndex ? "#fff" : "#9ca3af", border: i === stepIndex ? "none" : "1.5px solid #d1d5db" }}>
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
            <button onClick={onNext} disabled={!canNext} className="inline-flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: canNext ? "#2563eb" : "#93c5fd" }}>
              Next <IcChevronRight />
            </button>
          ) : (
            <button onClick={onGenerate} disabled={!canGenerate || isGenerating} className="inline-flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: canGenerate ? "#3b82f6" : "#93c5fd" }}>
              <IcSparkle /> Generate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Voice Settings ───────────────────────────────────────────────────────────
interface VoiceSettings {
  styleExaggeration: number;
  voiceStability: number;
  voiceVolume: number;
  voiceSpeed: number;
}
const DEFAULT_VOICE_SETTINGS: VoiceSettings = { styleExaggeration: 60, voiceStability: 70, voiceVolume: 100, voiceSpeed: 115 };

function IcSliders() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <path d="M3 5h2m0 0a2 2 0 004 0m-4 0a2 2 0 014 0m0 0h8M3 10h10m0 0a2 2 0 004 0m-4 0a2 2 0 014 0m0 0h0M3 15h4m0 0a2 2 0 004 0m-4 0a2 2 0 014 0m0 0h6" />
    </svg>
  );
}

function VoiceSettingsModal({ voiceName, settings, onChange, onClose }: {
  voiceName: string;
  settings: VoiceSettings;
  onChange: (s: VoiceSettings) => void;
  onClose: () => void;
}) {
  const sliders: { key: keyof VoiceSettings; label: string; min: number; max: number }[] = [
    { key: "styleExaggeration", label: "Style Exaggeration", min: 0, max: 100 },
    { key: "voiceStability",    label: "Voice Stability",    min: 0, max: 100 },
    { key: "voiceVolume",       label: "Voice Volume",       min: 0, max: 100 },
    { key: "voiceSpeed",        label: "Voice Speed",        min: 50, max: 200 },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-[420px] mx-4 p-7" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 mb-1">Voice Settings</h3>
        <p className="text-xs text-gray-400 mb-5">{voiceName}</p>
        <div className="space-y-5">
          {sliders.map(({ key, label, min, max }) => (
            <div key={key}>
              <div className="flex justify-between mb-1.5">
                <span className="text-sm font-medium text-gray-700">{label}</span>
                <span className="text-sm font-semibold text-gray-900">{settings[key]}%</span>
              </div>
              <input
                type="range" min={min} max={max} value={settings[key]}
                onChange={e => onChange({ ...settings, [key]: Number(e.target.value) })}
                className="w-full h-1.5 rounded-full accent-blue-600 cursor-pointer"
              />
            </div>
          ))}
        </div>
        <button
          onClick={() => onChange(DEFAULT_VOICE_SETTINGS)}
          className="mt-6 w-full py-2.5 rounded-xl bg-gray-100 text-sm font-semibold text-gray-600 hover:bg-gray-200 transition-colors"
        >
          Reset Default
        </button>
      </div>
    </div>
  );
}

// ── Voice Card ───────────────────────────────────────────────────────────────
function VoiceCard({ voice, selected, onSelect, onOpenSettings }: {
  voice: Voice; selected: boolean; onSelect: () => void; onOpenSettings: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-3 px-3.5 py-3 rounded-xl border cursor-pointer transition-all ${selected ? "border-blue-500 bg-white" : "border-gray-200 bg-white hover:border-gray-300"}`}
      style={selected ? { borderWidth: "2px" } : { borderWidth: "1px" }}
    >
      {/* Filled blue play button */}
      <button
        type="button"
        onClick={e => e.stopPropagation()}
        className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 hover:bg-blue-700 transition-colors"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 ml-0.5">
          <path d="M4 2.5l9 5.5-9 5.5V2.5z" />
        </svg>
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{voice.name}</p>
        <div className="flex gap-1.5 mt-1 flex-wrap">
          <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md font-medium">{voice.gender}</span>
          <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md font-medium">{voice.age}</span>
          <span className="text-[10px] bg-blue-50 text-blue-500 px-2 py-0.5 rounded-md font-medium">{voice.accent}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onOpenSettings(); }}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors flex-shrink-0"
        title="Voice settings"
      >
        <IcSliders />
      </button>
    </div>
  );
}

// ── Voice Column ─────────────────────────────────────────────────────────────
function VoiceColumn({ title, selected, onSelect }: { title: string; selected: string; onSelect: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [settingsVoiceId, setSettingsVoiceId] = useState<string | null>(null);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(DEFAULT_VOICE_SETTINGS);

  const filtered = VOICES.filter(v =>
    v.name.toLowerCase().includes(search.toLowerCase()) || v.accent.toLowerCase().includes(search.toLowerCase())
  );

  const settingsVoice = VOICES.find(v => v.id === settingsVoiceId);

  return (
    <>
      {settingsVoice && (
        <VoiceSettingsModal
          voiceName={settingsVoice.name}
          settings={voiceSettings}
          onChange={setVoiceSettings}
          onClose={() => setSettingsVoiceId(null)}
        />
      )}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="9" cy="9" r="6" /><path d="M14 14l3 3" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, tag, etc."
            className="w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3.5 py-2 text-sm focus:outline-none placeholder:text-gray-400"
          />
        </div>
        {/* List */}
        <div className="overflow-y-auto space-y-2 pr-0.5" style={{ maxHeight: "calc(100vh - 300px)" }}>
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No voices found</p>
          ) : (
            filtered.map(v => (
              <VoiceCard
                key={v.id}
                voice={v}
                selected={selected === v.id}
                onSelect={() => onSelect(v.id)}
                onOpenSettings={() => setSettingsVoiceId(v.id)}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ── Main Page Component ──────────────────────────────────────────────────────
function RedditVideoFlow() {
  const router = useRouter();
  const params = useSearchParams();

  const stepParam = params.get("step") || "script";
  const stepIndex = Math.max(0, STEPS.findIndex(s => s.id === stepParam));

  // Script state
  const [username,      setUsername]      = useState("Crayo AI");
  const [upvotes,       setUpvotes]       = useState("99");
  const [comments,      setComments]      = useState("99");
  const [postTitle,     setPostTitle]     = useState("Crayo AI is a platform that allows you to create videos with AI.");
  const [darkMode,      setDarkMode]      = useState(true);
  const [showIntroCard, setShowIntroCard] = useState(true);
  const [script,        setScript]        = useState("");

  // AI script modal
  const [isModalOpen,   setIsModalOpen]   = useState(false);
  const [activeTab,     setActiveTab]     = useState<"reddit" | "prompt">("reddit");
  const [redditUrl,     setRedditUrl]     = useState("");
  const [promptTopic,   setPromptTopic]   = useState("");
  const [promptTone,    setPromptTone]    = useState("informative");
  const [promptLength,  setPromptLength]  = useState("1m");
  const [promptHook,    setPromptHook]    = useState("");
  const [promptCta,     setPromptCta]     = useState("");
  const [loadingScrape, setLoadingScrape] = useState(false);

  // Subtitle style state
  const [subtitleMode,  setSubtitleMode]  = useState<"oneword" | "lines">("oneword");
  const [selectedStyle, setSelectedStyle] = useState(0);

  // Video state
  const [selectedBg,    setSelectedBg]    = useState(0);
  const [bgFilter,      setBgFilter]      = useState("All");

  // Audio state
  const [introVoice,    setIntroVoice]    = useState("william");
  const [scriptVoice,   setScriptVoice]   = useState("william");
  const [selectedMusic, setSelectedMusic] = useState(0);

  const { status: genStatus, videoUrl, error: genError, generateRedditVideo, reset: resetGenerate } = useVideoGenerate();
  const isGenerating = genStatus !== "idle";

  function goTo(i: number) { router.push(`/dashboard/create/reddit-video?step=${STEPS[i].id}`); }

  function loadSampleData() {
    setUsername("AskReddit");
    setUpvotes("14.2K");
    setComments("980");
    setPostTitle("What is a secret you will take to your grave?");
    setScript("When I was ten years old, I accidentally broke my dad's favorite vintage watch that he got from his grandfather. I was so scared that I buried it in the backyard. My parents spent weeks looking for it and eventually assumed it was lost at a restaurant. Ten years later, they sold the house and we moved. To this day, they still think it was stolen, and I've never had the courage to tell them.");
  }

  async function handleRedditImport() {
    if (!redditUrl.trim()) return;
    setLoadingScrape(true);
    try {
      const token = getStoredToken() || "";
      const res = await fetch("/api/generate/reddit-scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: redditUrl }),
      });
      if (res.ok) {
        const data = await res.json() as { subreddit: string; ups: number; comments: number; title: string; selftext: string };
        setUsername(data.subreddit || "r/AskReddit");
        setUpvotes(String(data.ups || 99));
        setComments(String(data.comments || 99));
        setPostTitle(data.title || "");
        setScript(data.selftext || data.title || "");
        setIsModalOpen(false);
      }
    } catch (err) { console.error(err); }
    finally { setLoadingScrape(false); }
  }

  async function handleAIPromptGenerate() {
    if (!promptTopic.trim()) return;
    setLoadingScrape(true);
    try {
      const token = getStoredToken() || "";
      const res = await fetch("/api/generate/script", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ topic: promptTopic, style: `${promptTone} tone, about ${promptLength} duration, starting with hook "${promptHook}" and ending with CTA "${promptCta}"` }),
      });
      if (res.ok) {
        const data = await res.json() as { script: string; title: string };
        setPostTitle(promptTopic);
        setScript(data.script || "");
        setIsModalOpen(false);
      }
    } catch (err) { console.error(err); }
    finally { setLoadingScrape(false); }
  }

  function handleGenerate() {
    const token = getStoredToken() || "";
    const chosenBg = BACKGROUNDS[selectedBg];
    const bgVideoUrl = `${BACKDROP_CDN}/${chosenBg.id}/video.mp4`;
    const bgMusicUrl = selectedMusic > 0
      ? `https://gameplay-cdn.com/music/${BACKGROUND_MUSIC[selectedMusic].name.toLowerCase().replace(/ /g, "-")}.mp3`
      : "";
    void generateRedditVideo({ postTitle, username, script, introVoiceId: introVoice, scriptVoiceId: scriptVoice, bgMusicUrl, bgVideoUrl, subtitleStyleIndex: selectedStyle, subtitleMode, token });
  }

  const BG_TAGS = ["All", "Popular", "Chill", ...Array.from(new Set(BACKGROUNDS.map(b => b.author)))];
  const filteredBgs = BACKGROUNDS.filter(b => {
    if (bgFilter === "All") return true;
    if (bgFilter === "Popular") return b.tag === "Popular";
    if (bgFilter === "Chill") return b.tag === "Chill";
    return b.author === bgFilter;
  });

  const canNext = stepIndex === 0 ? (!!postTitle && !!script) : true;
  const canGenerate = !!script.trim() && !isGenerating;

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ToolsSidebar active="create" />
      <main className="flex-1 overflow-y-auto bg-white flex flex-col">
        <Header stepIndex={stepIndex} onNext={() => goTo(stepIndex + 1)} onBack={() => goTo(stepIndex - 1)}
          onGenerate={handleGenerate} canNext={canNext} canGenerate={canGenerate} isGenerating={isGenerating} />

        {isGenerating ? (
          <GeneratingOverlay status={genStatus} videoUrl={videoUrl} error={genError} onReset={resetGenerate} />
        ) : (
          <div className="flex-1">

            {/* ── Step 1: Script ── */}
            {stepIndex === 0 && (
              <div className="px-8 pt-6 pb-10 grid grid-cols-1 lg:grid-cols-2 gap-8" style={{ minHeight: "calc(100vh - 160px)" }}>
                {/* Left: Controls */}
                <div className="bg-[#F7F7F7] border border-gray-100 rounded-[28px] p-6 flex flex-col space-y-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-900">Generate Story Video</h2>
                    <div className="flex gap-2">
                      <button onClick={loadSampleData} className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl border border-gray-200 transition-colors">Sample Data</button>
                      <button onClick={() => setIsModalOpen(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-1.5 shadow">
                        <IcSparkle /> AI Script
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {[["Username", username, setUsername], ["Upvotes", upvotes, setUpvotes], ["Comments", comments, setComments]].map(([label, val, setter]) => (
                      <div key={String(label)} className="flex flex-col space-y-1">
                        <label className="text-[11px] font-bold text-gray-500 uppercase">{String(label)}</label>
                        <input value={String(val)} onChange={e => (setter as (v: string) => void)(e.target.value)}
                          className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none" />
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col space-y-1.5">
                    <label className="text-[11px] font-bold text-gray-500 uppercase">Post Title (Intro text)</label>
                    <textarea rows={2} value={postTitle} onChange={e => setPostTitle(e.target.value)} placeholder="Intro title of the story…"
                      className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none resize-none" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setDarkMode(!darkMode)}
                      className={`py-3.5 rounded-xl border text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${darkMode ? "bg-zinc-900 border-zinc-900 text-white" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
                      Dark Mode
                    </button>
                    <button onClick={() => setShowIntroCard(!showIntroCard)}
                      className={`py-3.5 rounded-xl border text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${showIntroCard ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
                      Show Intro Card {showIntroCard && <IcCheck />}
                    </button>
                  </div>

                  <div className="flex flex-col space-y-1.5 flex-1">
                    <label className="text-[11px] font-bold text-gray-500 uppercase">Video Script Content</label>
                    <textarea value={script} onChange={e => setScript(e.target.value)} placeholder="Enter video script content…"
                      className="bg-white border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-800 focus:outline-none flex-1 resize-none" style={{ minHeight: "150px" }} />
                  </div>

                  <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex justify-between items-start">
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-blue-900">Limited time offer: 15 free credits!</p>
                      <p className="text-[11px] text-blue-700 leading-normal">We&apos;re offering free credits for any feedback / feature requests you have.</p>
                    </div>
                    <a href="mailto:support@clipforge.ai" className="text-xs font-extrabold text-blue-600 hover:underline bg-white px-3.5 py-2 rounded-lg border border-blue-200 whitespace-nowrap shadow-sm">Contact our team</a>
                  </div>
                </div>

                {/* Right: Preview */}
                <div className="flex flex-col space-y-6">
                  <div className="flex flex-col space-y-2">
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Intro Preview</h3>
                    {showIntroCard ? (
                      <div className={`rounded-2xl p-5 border shadow-sm transition-colors duration-200 ${darkMode ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-gray-200 text-gray-900"}`}>
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center text-white text-lg font-bold">r</div>
                          <div>
                            <div className="flex items-center gap-1.5 font-bold text-sm">
                              <span>{username}</span>
                              <span className="bg-blue-500 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center text-[8px]">✓</span>
                            </div>
                            <div className="flex gap-1 mt-0.5">
                              {["🏆", "⭐", "🥈", "🍪"].map((a, i) => <span key={i} className="text-xs opacity-80">{a}</span>)}
                            </div>
                          </div>
                        </div>
                        <p className="text-base font-bold leading-snug mb-4">{postTitle || "Title preview…"}</p>
                        <div className="flex items-center gap-4 pt-3.5 border-t border-black/5 text-xs font-semibold text-gray-500">
                          <span className="flex items-center gap-1.5"><IcHeart /> {upvotes}</span>
                          <span className="flex items-center gap-1.5"><IcMessage /> {comments}</span>
                          <span className="flex items-center gap-1.5 ml-auto"><IcShare /> share</span>
                        </div>
                      </div>
                    ) : (
                      <div className="h-[140px] rounded-2xl border border-dashed border-gray-200 flex items-center justify-center text-sm text-gray-400">Intro Card Hidden</div>
                    )}
                  </div>
                  <div className="flex flex-col space-y-2 flex-1">
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Script Preview</h3>
                    <div className="border border-gray-100 rounded-2xl bg-gray-50 p-5 overflow-y-auto max-h-[280px] text-sm text-gray-600 leading-relaxed font-mono">
                      {script || "Type or import a script to preview…"}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 2: Subtitle Styles ── */}
            {stepIndex === 1 && (
              <div className="px-8 pt-6 pb-10">
                <h2 className="text-lg font-bold text-gray-900">Select Subtitle Template</h2>
                <div className="flex items-center gap-3 mt-3 mb-5">
                  <span className="text-sm font-medium" style={{ color: subtitleMode === "oneword" ? "#111827" : "#9ca3af" }}>One Word</span>
                  <button
                    onClick={() => { setSubtitleMode(subtitleMode === "oneword" ? "lines" : "oneword"); setSelectedStyle(0); }}
                    className="relative w-10 h-5 rounded-full transition-colors"
                    style={{ background: subtitleMode === "lines" ? "#2563eb" : "#cbd5e1" }}
                  >
                    <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm" style={{ left: subtitleMode === "lines" ? "22px" : "2px" }} />
                  </button>
                  <span className="text-sm font-medium" style={{ color: subtitleMode === "lines" ? "#111827" : "#9ca3af" }}>Lines</span>
                </div>

                <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {(subtitleMode === "oneword" ? ONE_WORD_STYLES : LINE_STYLES).map((st, i) => {
                    const isSel = selectedStyle === i;
                    const sample = subtitleMode === "oneword" ? "Crayo" : "The quick brown";
                    return (
                      <button key={i} onClick={() => setSelectedStyle(i)}
                        className="group relative h-[104px] rounded-xl flex items-center justify-center px-4 transition-all overflow-hidden cursor-pointer"
                        style={{ background: "#243044", border: isSel ? "2px solid #2563eb" : "2px solid transparent" }}>
                        {isSel && (
                          <span className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shadow">
                            <IcCheck />
                          </span>
                        )}
                        <span className="text-[22px] leading-tight text-center transition-transform duration-200 group-hover:scale-110" style={st}>{sample}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Step 3: Background Videos ── */}
            {stepIndex === 2 && (
              <div className="px-8 pt-6 pb-10">
                <h2 className="text-lg font-bold text-gray-900">Select Background Video</h2>
                <p className="text-sm text-gray-500 mt-1.5">
                  <span className="font-semibold text-gray-700">Tip:</span> You can replace the background video after generation in the editor.
                </p>

                {/* Filter tabs */}
                <div className="flex items-center gap-2 mt-4 flex-wrap">
                  {BG_TAGS.map(tag => (
                    <button key={tag} onClick={() => setBgFilter(tag)}
                      className="px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors"
                      style={{ background: bgFilter === tag ? "#2563eb" : "#f3f4f6", color: bgFilter === tag ? "#fff" : "#4b5563" }}>
                      {tag}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 mt-5">
                  {filteredBgs.map((b) => {
                    const globalIdx = BACKGROUNDS.indexOf(b);
                    const isSel = selectedBg === globalIdx;
                    const thumbUrl = `${BACKDROP_CDN}/${b.id}/thumbnail.webp`;
                    return (
                      <div key={b.id} onClick={() => setSelectedBg(globalIdx)}
                        className="relative overflow-hidden rounded-lg border bg-white cursor-pointer transition-all"
                        style={{ borderColor: isSel ? "#2563eb" : "#e5e7eb" }}>
                        {isSel && (
                          <div className="absolute left-3 top-3 z-30 h-5 w-5 rounded-full border border-blue-600 bg-blue-500 flex items-center justify-center text-white">
                            <IcCheck />
                          </div>
                        )}
                        {b.tag && (
                          <div className="absolute right-3 top-3 z-30 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{b.tag}</div>
                        )}
                        <div className="relative w-full overflow-hidden" style={{ height: "160px" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={thumbUrl} alt="" className="absolute inset-0 h-full w-full object-cover blur-lg scale-110" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="relative h-full" style={{ aspectRatio: "9/16" }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={thumbUrl} alt={b.title} className="h-full w-full object-cover select-none" />
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1.5 p-3">
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-medium text-gray-900 truncate">{b.title}</h3>
                            <div className="flex items-center gap-1">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={b.authorImg} alt={b.author} className="h-4 w-4 rounded-full object-cover" />
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
              <div className="mx-6 mt-4 mb-8 border border-gray-200 rounded-2xl overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
                  {/* Intro Voice */}
                  <div className="p-5">
                    <VoiceColumn title="Select Intro Voice" selected={introVoice} onSelect={setIntroVoice} />
                  </div>
                  {/* Script Voice */}
                  <div className="p-5">
                    <VoiceColumn title="Select Script Voice" selected={scriptVoice} onSelect={setScriptVoice} />
                  </div>

                  {/* Background Music */}
                  <div className="p-5 flex flex-col gap-3">
                    <h3 className="text-sm font-bold text-gray-900">Select Background Music</h3>
                    <div className="overflow-y-auto space-y-2" style={{ maxHeight: "calc(100vh - 300px)" }}>
                      {BACKGROUND_MUSIC.map((m, i) => {
                        const isSel = selectedMusic === i;
                        return (
                          <div key={i} onClick={() => setSelectedMusic(i)}
                            className={`px-3.5 py-3 rounded-xl border cursor-pointer transition-all ${isSel ? "border-blue-500 bg-white" : "border-gray-200 bg-white hover:border-gray-300"}`}
                            style={isSel ? { borderWidth: "2px" } : { borderWidth: "1px" }}>
                            <div className="flex items-center gap-2.5">
                              {/* Outline play button for music */}
                              <button type="button" onClick={e => e.stopPropagation()}
                                className="w-7 h-7 rounded-full border-2 border-blue-500 text-blue-500 flex items-center justify-center flex-shrink-0 hover:bg-blue-50 transition-colors">
                                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 ml-0.5">
                                  <path d="M4 2.5l9 5.5-9 5.5V2.5z" />
                                </svg>
                              </button>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">{m.name}</p>
                              </div>
                              {m.duration && <span className="text-xs text-gray-400 flex-shrink-0">{m.duration}</span>}
                              <IcMusic />
                            </div>
                            {/* Waveform */}
                            {i > 0 && (
                              <div className="flex items-end gap-px h-5 mt-2">
                                {[4,8,14,20,10,18,12,16,22,14,8,19,12,15,20,11,17,9,21,13,16,10,18,14,8,12,20,15,11,17,9,22,13,16,8,14,20,10,18,12].map((h, j) => (
                                  <div key={j} className="flex-1 rounded-full transition-colors" style={{ height: `${h}px`, background: isSel ? "#3b82f6" : "#d1d5db" }} />
                                ))}
                              </div>
                            )}
                            {i === 0 && (
                              <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">{m.desc}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── AI Script Modal ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-1.5"><IcSparkle /> Generate Script</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><IcX /></button>
            </div>
            <div className="flex border-b border-gray-100">
              {(["reddit", "prompt"] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-all ${activeTab === tab ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                  {tab === "reddit" ? "Reddit URL" : "AI Prompt"}
                </button>
              ))}
            </div>
            <div className="p-6">
              {activeTab === "reddit" ? (
                <div className="space-y-4">
                  <div className="flex flex-col space-y-1.5">
                    <label className="text-xs font-bold text-gray-600">Paste Reddit URL</label>
                    <input value={redditUrl} onChange={e => setRedditUrl(e.target.value)} placeholder="https://www.reddit.com/r/AskReddit/comments/…"
                      className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-800 focus:outline-none placeholder:text-gray-400" />
                    <button onClick={() => setRedditUrl("https://www.reddit.com/r/AskReddit/comments/17yv7v8/what_scientific_breakthrough_are_we_closer_to/")}
                      className="text-xs text-blue-600 font-bold hover:underline self-start mt-1">Use Example URL</button>
                  </div>
                  <button onClick={handleRedditImport} disabled={loadingScrape || !redditUrl.trim()}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm">
                    {loadingScrape ? "Fetching post…" : "Get Reddit Post"}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col space-y-1.5">
                    <label className="text-xs font-bold text-gray-600">Topic</label>
                    <input value={promptTopic} onChange={e => setPromptTopic(e.target.value)} placeholder="e.g. Life hacks that feel illegal to know"
                      className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-sm text-gray-800 focus:outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-xs font-bold text-gray-600">Tone</label>
                      <select value={promptTone} onChange={e => setPromptTone(e.target.value)}
                        className="rounded-xl border border-gray-200 px-3.5 py-2 text-sm bg-white text-gray-800 focus:outline-none">
                        <option value="informative">Informative</option>
                        <option value="funny">Funny</option>
                        <option value="dramatic">Dramatic</option>
                        <option value="serious">Serious</option>
                        <option value="emotional">Emotional</option>
                        <option value="shocking">Shocking</option>
                      </select>
                    </div>
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-xs font-bold text-gray-600">Length</label>
                      <select value={promptLength} onChange={e => setPromptLength(e.target.value)}
                        className="rounded-xl border border-gray-200 px-3.5 py-2 text-sm bg-white text-gray-800 focus:outline-none">
                        <option value="30s">30s</option>
                        <option value="45s">45s</option>
                        <option value="1m">1m</option>
                        <option value="1m30s">1m 30s</option>
                        <option value="2m">2m</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-xs font-bold text-gray-600">Starting Hook</label>
                      <input value={promptHook} onChange={e => setPromptHook(e.target.value)} placeholder="e.g. I bet you didn't know this…"
                        className="rounded-xl border border-gray-200 px-3 py-2 text-xs focus:outline-none" />
                    </div>
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-xs font-bold text-gray-600">Ending CTA</label>
                      <input value={promptCta} onChange={e => setPromptCta(e.target.value)} placeholder="e.g. Follow for part 2!"
                        className="rounded-xl border border-gray-200 px-3 py-2 text-xs focus:outline-none" />
                    </div>
                  </div>
                  <button onClick={handleAIPromptGenerate} disabled={loadingScrape || !promptTopic.trim()}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm">
                    {loadingScrape ? "Generating script…" : "Generate AI Script"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
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
