"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";
import ToolsSidebar from "@/app/components/ToolsSidebar";
import { xpToLevel, levelColor, TOTAL_XP } from "@/lib/quest-config";

interface QuestItem {
  id: string;
  title: string;
  xp: number;
  trigger: string;
  completedAt: string | null;
}

interface QuestData {
  quests: QuestItem[];
  earnedXp: number;
  totalXp: number;
  remaining: number;
  level: string;
  allComplete: boolean;
}


// ── Avatar Menu ───────────────────────────────────────────────────────────────
// ── Misc Icons ─────────────────────────────────────────────────────────────────
function IcZap() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>;
}
function IcArrow() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M5 12h14M12 5l7 7-7 7"/></svg>;
}
function IcChevron() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 18l6-6-6-6"/></svg>;
}
function IcDiscord() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>;
}
function IcFilm() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M17 7h5M2 17h5M17 17h5"/></svg>;
}
function IcMic() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>;
}
function IcImage() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>;
}
function IcFlame() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg>;
}
function IcTrophy() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M6 9H4a2 2 0 000 4h2M18 9h2a2 2 0 010 4h-2"/><path d="M6 5h12v8a6 6 0 01-12 0V5zM9 21h6M12 17v4"/></svg>;
}
function IcVideo() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>;
}
function IcUser() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
}
function IcEraser() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M20 20H7L3 16l10-10 7 7-3.5 3.5"/><path d="M6.5 17.5l4-4"/></svg>;
}
function IcYoutube() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 001.46 6.42 29 29 0 001 12a29 29 0 00.46 5.58A2.78 2.78 0 003.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.95A29 29 0 0023 12a29 29 0 00-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/></svg>;
}


// ── Tool Card Preview Illustrations ───────────────────────────────────────────
function AutoClipPreview() {
  return (
    <div className="h-[160px] bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center gap-3 px-4 overflow-hidden">
      <div className="flex gap-1.5 items-center">
        {[{ c: "from-rose-400 to-red-700", r: -7 }, { c: "from-amber-400 to-orange-600", r: 0 }, { c: "from-yellow-300 to-amber-500", r: 7 }].map((s, i) => (
          <div key={i} className={`w-[54px] h-[90px] rounded-xl overflow-hidden shadow-md border border-black/10 bg-gradient-to-b ${s.c}`} style={{ transform: `rotate(${s.r}deg)` }} />
        ))}
      </div>
      <div className="bg-white rounded-xl shadow-lg p-2.5 min-w-[112px]">
        <p className="text-gray-400 text-[9px] font-medium mb-1.5">How many viral clips do you want to cut</p>
        <div className="flex gap-0.5 mb-2">
          {[1, 2, 3, 4, 5].map(n => (
            <span key={n} className={`w-5 h-5 rounded text-[9px] font-bold flex items-center justify-center ${n === 5 ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500"}`}>{n}</span>
          ))}
        </div>
        {["Stream ✓", "Podcast", "Interview", "Lecture"].map(t => (
          <div key={t} className="flex items-center gap-1 mb-0.5">
            <div className={`w-2 h-2 rounded-sm border ${t.includes("✓") ? "bg-blue-500 border-blue-500" : "border-gray-300"}`} />
            <span className="text-[9px] text-gray-600">{t.replace(" ✓", "")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CutCropPreview() {
  return (
    <div className="h-[160px] bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center gap-3 px-4 overflow-hidden">
      <div className="flex gap-1">
        {["from-gray-500 to-gray-800", "from-gray-400 to-gray-600", "from-gray-300 to-gray-500"].map((g, i) => (
          <div key={i} className={`w-[52px] h-[90px] rounded-lg bg-gradient-to-b ${g} shadow border border-white/10`} />
        ))}
      </div>
      <svg className="w-5 h-5 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
      <div className="flex gap-1">
        {[0, 1].map(i => (
          <div key={i} className="w-[52px] h-[90px] rounded-lg border-2 border-blue-500 bg-blue-100/50 flex items-center justify-center">
            <div className="flex gap-0.5">{[...Array(3)].map((_, j) => <div key={j} className="w-0.5 h-5 bg-blue-400 rounded-full" />)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VoiceChangerPreview() {
  const bars = [8, 14, 20, 12, 18, 24, 10, 16, 22, 8, 20, 14, 18, 26, 12, 20, 16, 10, 22, 14, 8, 18, 24, 12, 20, 16, 14, 10];
  return (
    <div className="h-[140px] bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center gap-3 px-5 overflow-hidden">
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 shadow-md flex-shrink-0" />
      <div className="flex-1 flex flex-col gap-1.5 items-center">
        <div className="flex items-end gap-px h-7">
          {bars.map((h, i) => <div key={i} className="w-[3px] rounded-full bg-blue-400" style={{ height: `${h}px` }} />)}
        </div>
        <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center shadow">
          <div className="w-2 h-2 rounded-full bg-white" />
        </div>
      </div>
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-400 to-rose-600 shadow-md flex-shrink-0" />
    </div>
  );
}

function SubtitleRemoverPreview() {
  return (
    <div className="h-[140px] bg-gradient-to-br from-gray-50 to-slate-100 flex items-center justify-center gap-4 px-6 overflow-hidden">
      {[true, false].map((hasSub, i) => (
        <div key={i} className="relative w-[88px] h-[108px] rounded-xl overflow-hidden shadow border border-gray-200">
          <div className="w-full h-full bg-gradient-to-b from-gray-600 to-gray-900 flex items-end justify-center p-2">
            {hasSub
              ? <div className="bg-black/75 rounded px-1.5 py-0.5 text-[8px] text-white font-medium text-center">Hello World</div>
              : <div className="w-full h-2 rounded bg-white/10" />}
          </div>
          {!hasSub && (
            <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AICreatorPreview() {
  return (
    <div className="h-[140px] bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center gap-2.5 px-5 overflow-hidden">
      {[
        { g: "from-emerald-400 to-teal-600", scale: false },
        { g: "from-blue-400 to-indigo-600", scale: true },
        { g: "from-purple-400 to-pink-600", scale: false },
      ].map((s, i) => (
        <div key={i} className="relative">
          <div className={`w-[58px] h-[86px] rounded-xl bg-gradient-to-b ${s.g} shadow border border-white/20 ${s.scale ? "scale-110 shadow-xl" : ""}`} />
          {i < 2 && (
            <div className="absolute -right-2.5 top-1/2 -translate-y-1/2 z-10 w-4 h-4 rounded-full bg-white shadow border border-gray-200 flex items-center justify-center">
              <svg className="w-2 h-2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M9 18l6-6-6-6" strokeLinecap="round"/></svg>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function VocalRemoverPreview() {
  const wave = [10, 20, 14, 28, 18, 34, 12, 26, 16, 30, 22, 36, 14, 24, 18, 32, 20, 28, 12, 34, 16, 26, 20, 30, 14, 24, 18, 28];
  return (
    <div className="h-[140px] bg-gray-50 flex flex-col gap-3 p-4 justify-center overflow-hidden">
      <div className="flex items-center gap-3">
        <div className="relative w-10 h-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
          <span className="text-blue-500"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-4 h-4"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" strokeLinecap="round"/></svg></span>
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center">✕</span>
        </div>
        <div className="flex items-center gap-px h-5 flex-1">
          {wave.map((h, i) => <div key={i} className="w-[3px] rounded-full bg-rose-300" style={{ height: `${h * 0.6}px` }} />)}
        </div>
      </div>
      <div className="flex items-center gap-px h-6">
        {wave.map((h, i) => <div key={i} className="w-[3px] rounded-full bg-gray-300" style={{ height: `${h * 0.75}px` }} />)}
      </div>
    </div>
  );
}

// ── Data ───────────────────────────────────────────────────────────────────────

const QUESTS = [
  { icon: <IcDiscord />, title: "Join the community", xp: 500, desc: "Connect your Discord and join the Clipiro server.", color: "#5865F2" },
  { icon: <IcFilm />, title: "First clip", xp: 300, desc: "Walk through the Simple Editor and make your first clip.", color: "#3b82f6" },
  { icon: <IcMic />, title: "Hear yourself out", xp: 200, desc: "Generate your first AI voiceover.", color: "#a855f7" },
  { icon: <IcImage />, title: "Picture this", xp: 200, desc: "Generate your first AI image.", color: "#ec4899" },
];

const TOOLS_LARGE = [
  { title: "Clipiro AutoClip", desc: "Transform long videos into viral clips automatically", preview: <AutoClipPreview />, href: "/dashboard/create/auto-clip" },
  { title: "Cut & Crop", desc: "Trim and stitch your video(s) into one clip ready to edit", preview: <CutCropPreview />, href: "/dashboard/cut-and-crop" },
];
const TOOLS_SMALL = [
  { title: "Voice Changer", desc: "Change the voice of any audio or video file", preview: <VoiceChangerPreview />, href: "/dashboard/tools/voice-changer" },
  { title: "Subtitle Remover", desc: "Remove subtitles with AI in minutes", preview: <SubtitleRemoverPreview />, href: "/dashboard/tools/subtitle-remover" },
  { title: "AI Creator", desc: "Become an AI content creator in 3 steps", preview: <AICreatorPreview />, href: "/dashboard/ai-creator" },
];

const MINI_TOOLS = [
  { icon: <IcImage />,  label: "Image Generator",    href: "/dashboard/tools/image-generator" },
  { icon: <IcUser />,   label: "AI Face Swap",        href: "/dashboard/tools/face-swap" },
  { icon: <IcMic />,    label: "Voiceover Generator", href: "/dashboard/tools/voiceover" },
  { icon: <IcEraser />, label: "Background Remover",  href: "/dashboard/tools/background-remover" },
  { icon: <IcVideo />,  label: "VEO3 Generator",      href: "/dashboard/tools/video-generator" },
  { icon: <IcYoutube />,label: "YouTube Downloader",  href: "/dashboard/tools/youtube-downloader" },
];

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

// ── Page ───────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user, token, openAuthModal } = useAuth();
  const [questData, setQuestData] = useState<QuestData | null>(null);

  useEffect(() => {
    if (!user || !token) return;
    fetch("/api/quests", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setQuestData)
      .catch(() => {});
  }, [user, token]);

  async function handleDiscordQuest() {
    if (!token) return;
    window.open("https://discord.gg/clipiro", "_blank");
    try {
      await fetch("/api/quests/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ questId: "join-community" }),
      });
      const res = await fetch("/api/quests", { headers: { Authorization: `Bearer ${token}` } });
      setQuestData(await res.json());
    } catch { /* best-effort */ }
  }

  const earnedXp = questData?.earnedXp ?? 0;
  const remaining = questData?.remaining ?? 4;
  const level = questData ? questData.level : (user ? xpToLevel(0) : null);
  const progressPct = Math.round((earnedXp / TOTAL_XP) * 100);


  return (
    <div className="flex h-screen overflow-hidden bg-white">

      <ToolsSidebar active="home" />

      {/* ── Main ── */}
      <main className="flex-1 overflow-y-auto bg-white">

        {/* Top bar */}
        <div className="mx-auto w-full max-w-[1440px] px-8 flex items-center justify-end pt-5 pb-3 gap-3">
          {user ? null : (
            <button
              onClick={() => openAuthModal("login")}
              className="inline-flex items-center gap-1.5 bg-[#335CFF] text-white text-sm font-semibold px-4 py-2 rounded-full transition-transform duration-200 hover:scale-[1.01] cursor-pointer"
            >
              <IcZap />
              Login
            </button>
          )}
        </div>


        <div className="mx-auto w-full max-w-[1440px] px-8 pb-10 space-y-5">

          {/* ── Editor cards ── */}
          <div className="flex gap-3">
            {/* Simple Editor */}
            <Link href="/dashboard/simple-editor" className="flex items-center gap-3 px-5 py-3.5 rounded-2xl flex-1 hover:brightness-110 transition-all" style={{ background: "#0f1c35" }}>
              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.66 11.2C17.43 10.9 17.15 10.64 16.89 10.38C16.22 9.78 15.46 9.35 14.82 8.72C13.33 7.26 13 4.85 13.95 3C13 3.23 12.17 3.75 11.46 4.32C8.87 6.4 7.85 10.07 9.07 13.22C9.11 13.32 9.15 13.42 9.15 13.55C9.15 13.77 9 13.97 8.8 14.05C8.57 14.15 8.33 14.09 8.14 13.93C8.08 13.88 8.04 13.83 8 13.76C6.87 12.33 6.69 10.28 7.45 8.64C5.78 10 4.87 12.3 5 14.47C5.06 14.97 5.12 15.47 5.29 15.97C5.43 16.57 5.7 17.17 6 17.7C7.08 19.43 8.95 20.67 10.96 20.92C13.1 21.19 15.39 20.8 17.03 19.32C18.86 17.66 19.5 15 18.56 12.72L18.43 12.46C18.22 12 17.66 11.2 17.66 11.2Z"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm leading-tight">Simple Editor</p>
                <p className="text-gray-400 text-xs mt-0.5">Quick formatting &amp; subtitles</p>
              </div>
              <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 text-white">
                <IcArrow />
              </div>
            </Link>

            {/* Advanced Editor */}
            <Link href="/dashboard/editor/new" className="flex items-center gap-3 px-5 py-3.5 rounded-2xl flex-1 hover:brightness-110 transition-all" style={{ background: "#2563eb" }}>
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <IcZap />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm leading-tight">Advanced Editor</p>
                <p className="text-blue-200 text-xs mt-0.5">Full control from scratch</p>
              </div>
              <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0 text-white">
                <IcArrow />
              </div>
            </Link>

            {/* Free Tools */}
            <Link href="/dashboard/tools/free" className="flex items-center gap-3 px-5 py-3.5 rounded-2xl flex-1 border border-gray-200 hover:bg-gray-50 transition-colors">
              <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l7.07 17 2.51-7.39L21 11.07z" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-gray-900 font-bold text-sm leading-tight">Try our <span className="text-green-500">FREE</span> Tools</p>
                <p className="text-gray-400 text-xs mt-0.5">Audio balancer, video compressor, and more</p>
              </div>
              <div className="text-gray-300 flex-shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M9 18l6-6-6-6" strokeLinecap="round"/></svg>
              </div>
            </Link>
          </div>

          {/* ── Two-column layout ── */}
          <div className="flex gap-4 items-start">

            {/* ── Left column ── */}
            <div className="flex-1 min-w-0 space-y-4">

              {/* Onboarding */}
              <div className="rounded-2xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Onboarding</p>
                      {level && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: levelColor(level) + "18", color: levelColor(level) }}>
                          {level}
                        </span>
                      )}
                    </div>
                    {questData === null && user ? (
                      <div className="h-5 w-40 bg-gray-100 rounded animate-pulse mt-0.5" />
                    ) : (
                      <p className="text-gray-900 font-bold text-[15px]">
                        {remaining === 0 ? "All quests complete!" : `${remaining} quest${remaining !== 1 ? "s" : ""} to go`}
                      </p>
                    )}
                    <div className="mt-2 h-1 bg-gray-100 rounded-full w-64 overflow-hidden">
                      <div className="h-full bg-blue-600 rounded-full transition-all duration-500"
                        style={{ width: `${progressPct}%` }} />
                    </div>
                  </div>
                  <div className="text-right">
                    {questData === null && user ? (
                      <div className="h-7 w-24 bg-gray-100 rounded animate-pulse ml-auto" />
                    ) : (
                      <>
                        <span className="text-xl font-extrabold text-gray-900">{earnedXp}</span>
                        <span className="text-sm text-gray-400 font-normal"> / 1200 XP</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 border-t border-gray-100">
                  {QUESTS.map((q, i) => {
                    const liveQuest = questData?.quests.find(lq => lq.title === q.title);
                    const done = !!liveQuest?.completedAt;
                    const isDiscord = q.title === "Join the community";
                    return (
                      <button
                        key={i}
                        onClick={isDiscord ? handleDiscordQuest : undefined}
                        disabled={done}
                        className={`flex items-start gap-3 px-4 py-3.5 text-left transition-colors group
                          ${i % 2 === 0 ? "border-r border-gray-100" : ""}
                          ${i >= 2 ? "border-t border-gray-100" : ""}
                          ${done ? "bg-green-50 cursor-default" : "hover:bg-gray-50"}`}
                      >
                        <span className="mt-0.5 flex-shrink-0 opacity-60" style={{ color: q.color }}>{q.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <span className={`text-sm font-semibold ${done ? "line-through text-gray-400" : "text-gray-800"}`}>{q.title}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${done ? "bg-green-50 text-green-600 border-green-100" : "bg-blue-50 text-blue-600 border-blue-100"}`}>
                              +{q.xp} XP
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 leading-relaxed">{q.desc}</p>
                        </div>
                        {done ? (
                          <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                        ) : (
                          <span className="text-gray-300 group-hover:text-gray-500 transition-colors mt-0.5 flex-shrink-0"><IcChevron /></span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {questData?.allComplete && (
                  <div className="border-t border-green-100 bg-green-50 px-5 py-3 flex items-center gap-2.5">
                    <span className="text-green-500 text-lg">🎉</span>
                    <p className="text-sm font-semibold text-green-700">All quests complete! +5 credits have been added to your account.</p>
                  </div>
                )}
              </div>

              {/* Large tool cards — 2 col */}
              <div className="grid grid-cols-2 gap-3">
                {TOOLS_LARGE.map((tool, i) => (
                  <div key={i} className="rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow bg-white">
                    {tool.preview}
                    <div className="px-4 py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[14px] font-bold text-gray-900 leading-tight">{tool.title}</p>
                        <p className="text-xs text-blue-500 mt-0.5 leading-relaxed">{tool.desc}</p>
                      </div>
                      <Link href={tool.href} className="flex-shrink-0 inline-flex items-center gap-1 border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                        Try Now <IcChevron />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>

              {/* Small tool cards — 3 col */}
              <div className="grid grid-cols-3 gap-3">
                {TOOLS_SMALL.map((tool, i) => (
                  <div key={i} className="rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow bg-white">
                    {tool.preview}
                    <div className="px-3 py-3 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-gray-900 leading-tight">{tool.title}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">{tool.desc}</p>
                      </div>
                      {tool.href ? (
                        <Link href={tool.href} className="flex-shrink-0 inline-flex items-center gap-0.5 border border-gray-200 hover:bg-gray-50 text-gray-700 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                          Try Now <IcChevron />
                        </Link>
                      ) : (
                        <button className="flex-shrink-0 inline-flex items-center gap-0.5 border border-gray-200 hover:bg-gray-50 text-gray-700 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                          Try Now <IcChevron />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Clipiro Tools section ── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold text-gray-900">Clipiro Tools</h2>
                  <Link href="/dashboard/tools" className="text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors">
                    View All Tools <IcChevron />
                  </Link>
                </div>
                <div className="grid grid-cols-6 gap-2.5">
                  {MINI_TOOLS.map((tool, i) => (
                    <Link
                      key={i}
                      href={tool.href}
                      className="flex flex-col items-center gap-2 px-2 py-3.5 rounded-2xl border border-gray-200 hover:border-blue-200 hover:bg-blue-50/30 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 group-hover:bg-indigo-100 flex items-center justify-center transition-colors text-indigo-500">
                        {tool.icon}
                      </div>
                      <span className="text-[11px] font-medium text-gray-700 text-center leading-tight">{tool.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
