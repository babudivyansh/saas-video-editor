"use client";
import Link from "next/link";
import ToolsSidebar from "@/app/components/ToolsSidebar";
import { useAuth } from "@/app/components/AuthContext";
function IcZap() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>;
}
function IcArrow() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M5 12h14M12 5l7 7-7 7"/></svg>;
}

// ── Top-row card icons ─────────────────────────────────────────────────────────
function IcSmile() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>;
}
function IcYoutube() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 00.5 6.2 31 31 0 000 12a31 31 0 00.5 5.8 3 3 0 002.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 002.1-2.1A31 31 0 0024 12a31 31 0 00-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z"/></svg>;
}
function IcInstagram() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>;
}

function IcEraser() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M20 20H7L3 16l10-10 7 7-3.5 3.5"/><path d="M6.5 17.5l4-4"/></svg>;
}

// ── Tool preview illustrations ─────────────────────────────────────────────────
function ImageGenPreview() {
  return (
    <div className="h-[212px] bg-gray-50 flex flex-col gap-2.5 p-4 overflow-hidden">
      <div className="bg-white rounded-lg border border-gray-200 px-3 py-2.5 text-[11px] text-gray-500 shadow-sm">a small, adorable cat with bright green eyes…</div>
      <div className="flex gap-1.5">
        <span className="text-[9px] font-semibold text-gray-500 border border-gray-200 bg-white rounded-md px-2 py-1">⊞ View Presets</span>
        <span className="text-[9px] font-semibold text-gray-500 border border-gray-200 bg-white rounded-md px-2 py-1">✦ Prompt Generator</span>
        <span className="text-[9px] font-semibold text-gray-500 border border-gray-200 bg-white rounded-md px-2 py-1">DALL·E 3 ▾</span>
      </div>
      <div className="flex gap-1.5 mt-auto">
        {["from-amber-200 to-yellow-400", "from-stone-300 to-amber-500", "from-orange-200 to-amber-400", "from-yellow-200 to-orange-400"].map((g, i) => (
          <div key={i} className={`flex-1 h-[72px] rounded-lg bg-gradient-to-br ${g} border border-black/5`} />
        ))}
      </div>
    </div>
  );
}

function VoiceoverPreview() {
  const narrators = [{ n: "Dan Dan", t: "Male · Mid" }, { n: "Bill", t: "Male · Mid" }, { n: "Natasha", t: "Female" }];
  return (
    <div className="h-[212px] bg-gray-50 flex flex-col gap-2 p-4 overflow-hidden">
      <div className="flex gap-1.5">
        {narrators.map((x, i) => (
          <div key={i} className="flex-1 bg-white rounded-lg border border-gray-200 px-2 py-1.5 shadow-sm">
            <div className="flex items-center gap-1 mb-1">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-[9px] font-bold text-gray-700 truncate">{x.n}</span>
            </div>
            <p className="text-[8px] text-gray-400">{x.t}</p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-2.5 flex-1 shadow-sm">
        <p className="text-[9px] font-bold text-gray-600 mb-1.5">⌨ Type your script</p>
        {[1, 0.95, 0.8, 0.6].map((w, i) => (
          <div key={i} className="h-1.5 rounded-full bg-gray-100 mb-1.5" style={{ width: `${w * 100}%` }} />
        ))}
      </div>
    </div>
  );
}

function SpeechEnhancerPreview() {
  const top = [10, 18, 8, 24, 14, 30, 12, 22, 9, 26, 16, 20, 11, 28, 13, 19, 8, 24, 15, 21, 10, 27, 14, 18];
  const bot = [14, 22, 30, 18, 26, 12, 24, 32, 16, 28, 20, 34, 14, 26, 22, 30, 18, 24, 12, 28, 20, 32, 16, 24];
  return (
    <div className="h-[212px] bg-gray-50 flex flex-col gap-3 p-4 justify-center overflow-hidden">
      <div className="flex items-center justify-center gap-px h-8">
        {top.map((h, i) => <div key={i} className="w-[3px] rounded-full bg-gray-300" style={{ height: `${h}px` }} />)}
      </div>
      <div className="bg-blue-600 rounded-xl px-3 py-2.5 flex items-center gap-2 shadow">
        <span className="text-white"><svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2" fill="none" stroke="currentColor" strokeWidth="2"/></svg></span>
        <div className="flex items-center gap-px h-5 flex-1">
          {bot.map((h, i) => <div key={i} className="w-[2.5px] rounded-full bg-white/80" style={{ height: `${Math.min(h, 20)}px` }} />)}
        </div>
      </div>
    </div>
  );
}

function VideoGenPreview() {
  return (
    <div className="h-[212px] bg-gray-50 flex flex-col gap-2.5 p-4 overflow-hidden">
      <p className="text-[10px] font-bold text-gray-500">Write a prompt</p>
      <div className="bg-white rounded-lg border border-blue-200 px-3 py-2.5 flex items-center gap-2 shadow-sm">
        <span className="text-blue-500 text-xs">✦</span>
        <div className="h-1.5 rounded-full bg-blue-100 flex-1" />
      </div>
      <div className="flex gap-1.5">
        <span className="text-[9px] font-semibold text-white bg-blue-600 rounded-md px-2 py-1">✦ Generate</span>
        <span className="text-[9px] font-semibold text-gray-500 border border-gray-200 bg-white rounded-md px-2 py-1">✦ Prompt Generator</span>
      </div>
      <div className="flex gap-1.5 mt-auto items-center">
        <div className="w-10 h-16 rounded-lg bg-gray-200 border border-gray-200" />
        <div className="flex-1 h-[78px] rounded-lg bg-gradient-to-br from-amber-300 to-orange-500 border border-black/5 flex items-center justify-center">
          <span className="w-7 h-7 rounded-full bg-white/80 flex items-center justify-center text-gray-700 text-xs">▶</span>
        </div>
        <div className="w-10 h-16 rounded-lg bg-gray-200 border border-gray-200" />
      </div>
    </div>
  );
}

function VocalRemoverPreview() {
  const wave = [10, 20, 14, 28, 18, 34, 12, 26, 16, 30, 22, 36, 14, 24, 18, 32, 20, 28, 12, 34, 16, 26, 20, 30, 14, 24, 18, 28];
  return (
    <div className="h-[212px] bg-gray-50 flex flex-col gap-4 p-4 justify-center overflow-hidden">
      <div className="flex items-center gap-3">
        <div className="relative w-12 h-12 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
          <span className="text-blue-500"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-5 h-5"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" strokeLinecap="round"/></svg></span>
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center">✕</span>
        </div>
        <div className="flex items-center gap-px h-6 flex-1">
          {wave.map((h, i) => <div key={i} className="w-[3px] rounded-full bg-rose-300" style={{ height: `${h * 0.7}px` }} />)}
        </div>
      </div>
      <div className="flex items-center gap-px h-8">
        {wave.map((h, i) => <div key={i} className="w-[4px] rounded-full bg-gray-300" style={{ height: `${h}px` }} />)}
      </div>
    </div>
  );
}

function YouTubeDownloaderPreview() {
  return (
    <div className="h-[212px] bg-gray-50 flex flex-col gap-3 p-4 justify-center overflow-hidden">
      <div className="bg-white rounded-xl border border-gray-200 px-3 py-2.5 flex items-center gap-2 shadow-sm">
        <span className="text-red-500 flex-shrink-0">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 00.5 6.2 31 31 0 000 12a31 31 0 00.5 5.8 3 3 0 002.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 002.1-2.1A31 31 0 0024 12a31 31 0 00-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z"/></svg>
        </span>
        <div className="h-1.5 rounded-full bg-gray-200 flex-1" />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="flex gap-2.5 p-2">
          <div className="w-16 h-10 rounded-lg bg-gradient-to-br from-red-400 to-orange-500 flex items-center justify-center flex-shrink-0">
            <span className="w-4 h-4 rounded-full bg-white/80 flex items-center justify-center">
              <svg viewBox="0 0 10 10" fill="currentColor" className="w-2 h-2 text-red-600"><polygon points="3,1 9,5 3,9"/></svg>
            </span>
          </div>
          <div className="flex-1 min-w-0 py-0.5">
            <div className="h-1.5 rounded-full bg-gray-200 w-full mb-1.5" />
            <div className="h-1.5 rounded-full bg-gray-100 w-2/3" />
          </div>
        </div>
      </div>
      <div className="flex gap-1.5">
        {["720p MP4", "480p MP4", "MP3"].map((q, i) => (
          <span key={i} className={`text-[9px] font-semibold px-2 py-1 rounded-lg border ${i === 0 ? "bg-red-500 text-white border-red-500" : "bg-white border-gray-200 text-gray-600"}`}>{q}</span>
        ))}
      </div>
    </div>
  );
}

function BgRemoverPreview() {
  return (
    <div className="h-[212px] bg-gray-50 flex items-center justify-center gap-3 p-4 overflow-hidden">
      {/* Original with background */}
      <div className="flex-1 rounded-xl overflow-hidden border border-gray-200 bg-white flex flex-col items-center justify-center p-2 gap-1.5 h-full max-h-44">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center shadow">
          <svg viewBox="0 0 24 24" fill="white" className="w-8 h-8"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
        </div>
        <div className="w-full h-2 rounded bg-blue-100" />
        <div className="w-2/3 h-2 rounded bg-blue-50" />
        <p className="text-[9px] text-gray-400 mt-1">Original</p>
      </div>
      {/* Arrow */}
      <svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" className="w-5 h-5 flex-shrink-0"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      {/* Result transparent */}
      <div
        className="flex-1 rounded-xl overflow-hidden border border-gray-200 flex flex-col items-center justify-center p-2 gap-1.5 h-full max-h-44"
        style={{
          backgroundImage: "linear-gradient(45deg,#e5e7eb 25%,transparent 25%),linear-gradient(-45deg,#e5e7eb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e7eb 75%),linear-gradient(-45deg,transparent 75%,#e5e7eb 75%)",
          backgroundSize: "10px 10px",
          backgroundPosition: "0 0,0 5px,5px -5px,-5px 0",
          backgroundColor: "#f9fafb",
        }}
      >
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center shadow">
          <svg viewBox="0 0 24 24" fill="white" className="w-8 h-8"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
        </div>
        <p className="text-[9px] text-gray-400 mt-1">No Background</p>
      </div>
    </div>
  );
}

function FaceSwapPreview() {
  return (
    <div className="h-[212px] bg-gray-50 flex items-center justify-center gap-3 p-4 overflow-hidden">
      {/* Character image */}
      <div className="flex-1 rounded-xl overflow-hidden border border-gray-200 bg-white flex flex-col items-center justify-center p-2 gap-1.5 h-full max-h-44">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-300 to-orange-500 flex items-center justify-center shadow">
          <svg viewBox="0 0 24 24" fill="white" className="w-8 h-8"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
        </div>
        <p className="text-[9px] text-gray-400 mt-1">Character</p>
      </div>
      {/* Arrow */}
      <svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" className="w-5 h-5 flex-shrink-0"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      {/* Target image */}
      <div className="flex-1 rounded-xl overflow-hidden border-2 border-indigo-300 bg-white flex flex-col items-center justify-center p-2 gap-1.5 h-full max-h-44">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center shadow">
          <svg viewBox="0 0 24 24" fill="white" className="w-8 h-8"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
        </div>
        <p className="text-[9px] text-indigo-500 font-semibold mt-1">Swapped ✓</p>
      </div>
    </div>
  );
}

function SplitScreenPreview() {
  const wave = [8, 14, 10, 18, 12, 22, 9, 16, 13, 20, 11, 17, 8, 15, 12];
  return (
    <div className="h-[212px] bg-gray-50 flex items-stretch gap-0 overflow-hidden rounded-t-none">
      {/* Left half: user video */}
      <div className="flex-1 bg-gray-900 flex flex-col items-center justify-center gap-2 border-r border-gray-700">
        <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
        </div>
        <div className="flex items-center gap-px h-5">
          {wave.map((h, i) => <div key={i} className="w-[2.5px] rounded-full bg-blue-400/70" style={{ height: `${h}px` }} />)}
        </div>
        <p className="text-[8px] text-gray-400">Your Video</p>
      </div>
      {/* Right half: gameplay background */}
      <div className="flex-1 bg-gradient-to-b from-green-400 to-emerald-600 flex flex-col items-center justify-center gap-1">
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4"><path d="M8 5v14l11-7z"/></svg>
        </div>
        <p className="text-[8px] text-white/80 font-semibold">Background</p>
      </div>
    </div>
  );
}

function VerticalSplitPreview() {
  const wave = [8, 14, 10, 18, 12, 22, 9, 16, 13, 20];
  return (
    <div className="h-[212px] bg-gray-50 flex flex-col items-stretch gap-0 overflow-hidden">
      {/* Top half: user video */}
      <div className="flex-1 bg-gray-900 flex items-center justify-center gap-3 border-b border-gray-700">
        <div className="w-9 h-9 rounded-full bg-purple-500 flex items-center justify-center flex-shrink-0">
          <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
        </div>
        <div className="flex items-center gap-px h-4">
          {wave.map((h, i) => <div key={i} className="w-[2.5px] rounded-full bg-purple-400/70" style={{ height: `${h}px` }} />)}
        </div>
      </div>
      {/* Bottom half: gameplay */}
      <div className="flex-1 bg-gradient-to-b from-orange-400 to-red-500 flex items-center justify-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="white" className="w-3.5 h-3.5"><path d="M8 5v14l11-7z"/></svg>
        </div>
        <p className="text-[8px] text-white/80 font-semibold">Gameplay</p>
      </div>
    </div>
  );
}

function StreamerPreview() {
  return (
    <div className="h-[212px] bg-gray-900 flex flex-col overflow-hidden relative">
      {/* Fake video background */}
      <div className="flex-1 bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
        <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center shadow-lg">
          <svg viewBox="0 0 24 24" fill="white" className="w-8 h-8"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
        </div>
      </div>
      {/* Subtitle bar at bottom */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-4 py-2.5">
        <div className="flex justify-center">
          <span className="text-[11px] font-extrabold text-white tracking-wide uppercase" style={{ textShadow: "0 1px 4px #000" }}>THIS IS YOUR TITLE</span>
        </div>
        <div className="flex justify-center gap-px mt-1.5">
          {["and", "this", "is", "a", "subtitle"].map((w, i) => (
            <span key={i} className={`text-[9px] font-bold px-0.5 ${i === 2 ? "text-yellow-400" : "text-white"}`}>{w} </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function BrainstormerPreview() {
  return (
    <div className="h-[212px] bg-gray-50 flex gap-2.5 p-4 overflow-hidden">
      <div className="w-1/2 flex flex-col gap-2">
        <div className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center text-white text-xs">✦</div>
        {["Idea topic", "Select a tone", "Target Audience"].map((l, i) => (
          <div key={i} className="bg-white rounded-md border border-gray-200 px-2 py-1.5 shadow-sm">
            <p className="text-[8px] text-gray-400">{l}</p>
          </div>
        ))}
        <span className="text-[9px] font-semibold text-white bg-gray-300 rounded-md px-2 py-1.5 text-center">Generate</span>
      </div>
      <div className="w-1/2 bg-white rounded-lg border border-gray-200 p-2.5 shadow-sm">
        <p className="text-[8px] text-gray-400 mb-2">Your idea will appear here</p>
        {[1, 0.9, 0.95, 0.7, 0.85, 0.6].map((w, i) => (
          <div key={i} className="h-1.5 rounded-full bg-gray-100 mb-1.5" style={{ width: `${w * 100}%` }} />
        ))}
      </div>
    </div>
  );
}

function RedditPreview() {
  return (
    <div className="h-[212px] bg-gray-50 flex gap-2.5 p-4 overflow-hidden">
      <div className="w-1/2 flex flex-col gap-2">
        <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs font-bold">r</div>
        {["Content", "Video Script"].map((l, i) => (
          <div key={i} className="bg-white rounded-md border border-gray-200 px-2 py-1.5 shadow-sm">
            <p className="text-[8px] text-gray-400 mb-1">{l}</p>
            <div className="h-1 rounded-full bg-gray-100 w-3/4" />
          </div>
        ))}
      </div>
      <div className="w-1/2 rounded-lg overflow-hidden border border-gray-200 bg-gradient-to-b from-sky-300 to-blue-600 relative">
        <div className="absolute top-2 left-2 right-2 bg-white/90 rounded p-1.5">
          <p className="text-[7px] font-bold text-gray-700">r/AskReddit</p>
          <p className="text-[7px] text-gray-500 leading-tight mt-0.5">What scientific breakthrough are we closer to than people realize?</p>
        </div>
        <div className="absolute bottom-1 left-0 right-0 text-center text-[7px] font-bold text-white">THE QUICK BROWN FOX</div>
      </div>
    </div>
  );
}

function FakeTextsPreview() {
  return (
    <div className="h-[212px] bg-gray-50 flex items-center justify-center gap-2 p-4 overflow-hidden">
      <div className="flex flex-col gap-1.5 w-1/2">
        {[0.7, 0.5, 0.85].map((w, i) => (
          <div key={i} className="h-6 rounded-xl bg-gray-200" style={{ width: `${w * 100}%` }} />
        ))}
      </div>
      <div className="w-[88px] h-[170px] rounded-xl bg-gray-900 p-2 flex flex-col gap-1.5 shadow-lg">
        <div className="self-center text-[7px] text-gray-400 mb-1">my baby &lt;3</div>
        <div className="self-end max-w-[80%] bg-blue-500 rounded-lg rounded-br-sm px-1.5 py-1 text-[7px] text-white">would you still love me…</div>
        <div className="self-start max-w-[80%] bg-gray-700 rounded-lg rounded-bl-sm px-1.5 py-1 text-[7px] text-gray-100">well that depends…</div>
        <div className="self-start max-w-[80%] bg-gray-700 rounded-lg rounded-bl-sm px-1.5 py-1 text-[7px] text-gray-100">a leopard 2 A7</div>
        <div className="self-end max-w-[80%] bg-blue-500 rounded-lg rounded-br-sm px-1.5 py-1 text-[7px] text-white">a tiger</div>
      </div>
    </div>
  );
}

// ── Data ───────────────────────────────────────────────────────────────────────

const TOP_CARDS = [
  { icon: <IcSmile />, title: "Free Tools", desc: "Audio balancer, video compressor, and more", color: "text-amber-500", bg: "bg-amber-50", href: "/dashboard/tools/free" },
  { icon: <IcYoutube />, title: "Youtube Downloader", desc: "Download Youtube videos", color: "text-red-500", bg: "bg-red-50", href: "/dashboard/tools/youtube-downloader" },
  { icon: <IcInstagram />, title: "Instagram Downloader", desc: "Download Reels, posts & IGTV", color: "text-pink-600", bg: "bg-pink-50", href: "/dashboard/tools/instagram-downloader" },
];

const TOOLS = [
  { title: "AI Image Generator", desc: "Generate high quality images with AI in seconds.", preview: <ImageGenPreview />, badge: "1 credit", href: "/dashboard/tools/image-generator" },
  { title: "AI Voiceover Generator", desc: "Make high quality voiceovers in seconds with 50+ narrators.", preview: <VoiceoverPreview />, badge: "1 credit", href: "/dashboard/tools/voiceover" },
  { title: "AI Speech Enhancer", desc: "Enhance the quality of any audio or video file with AI.", preview: <SpeechEnhancerPreview />, badge: "3 credits", href: "/dashboard/tools/enhance-speech" },
  { title: "AI Video Generator", desc: "VEO3 is a tool that allows you to create videos with AI.", preview: <VideoGenPreview />, badge: "20 credits", href: "/dashboard/tools/video-generator" },
  { title: "AI Vocal Remover", desc: "Remove vocals from any audio or video file with AI.", preview: <VocalRemoverPreview />, badge: "2 credits", href: "/dashboard/tools/vocal-remover" },
{ title: "AI Brainstormer", desc: "Generate viral content ideas based on your niche.", preview: <BrainstormerPreview />, badge: "1 credit", href: "/dashboard/tools/brainstormer" },
  { title: "Reddit Video Generator", desc: "Convert Reddit posts into viral videos with AI.", preview: <RedditPreview />, badge: "2 credits", href: "/dashboard/create/reddit-video" },
  { title: "Fake Texts Video Generator", desc: "Create engaging fake texts videos with AI to go viral.", preview: <FakeTextsPreview />, badge: "2 credits", href: "/dashboard/create/text-video" },
];

// ── Page ───────────────────────────────────────────────────────────────────────
export default function ToolsPage() {
  const { user, openAuthModal } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ToolsSidebar active="create" />

      {/* ── Main ── */}
      <main className="flex-1 overflow-y-auto bg-white">

        {/* Top bar */}
        <div className="mx-auto w-full max-w-[1440px] px-8 flex items-center justify-end pt-5 pb-3">
          {user ? null : (
            <button
              onClick={() => openAuthModal("login")}
              className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-full transition-colors shadow-sm cursor-pointer"
            >
              <IcZap />
              Login
            </button>
          )}
        </div>

        <div className="mx-auto w-full max-w-[1440px] px-8 pb-12 space-y-5">

          {/* ── Top row cards ── */}
          <div className="grid grid-cols-3 gap-4">
            {TOP_CARDS.map((c, i) => (
              <Link key={i} href={c.href} className="flex items-center gap-3 px-5 py-3.5 rounded-2xl border border-gray-200 hover:bg-gray-50 transition-colors text-left">
                <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0 ${c.color}`}>
                  {c.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 font-bold text-sm leading-tight">{c.title}</p>
                  <p className="text-gray-400 text-xs mt-0.5 truncate">{c.desc}</p>
                </div>
                <span className="text-gray-300 flex-shrink-0"><IcArrow /></span>
              </Link>
            ))}
          </div>

          {/* ── Tools grid ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {TOOLS.map((tool, i) => (
              <div key={i} className="rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow bg-white flex flex-col">
                {tool.preview}
                <div className="px-4 py-4 flex flex-col flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <h3 className="text-[15px] font-bold text-gray-900 leading-tight">{tool.title}</h3>
                    {tool.badge && (
                      <span className="text-[10px] font-bold text-white bg-blue-600 px-2 py-0.5 rounded-full flex-shrink-0">{tool.badge}</span>
                    )}
                  </div>
                  <p className="text-[13px] text-gray-500 leading-relaxed mb-4 flex-1">{tool.desc}</p>
                  <Link
                    href={tool.href}
                    className="w-full border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-800 text-sm font-semibold py-2.5 rounded-xl transition-colors text-center block"
                  >
                    Get Started
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
