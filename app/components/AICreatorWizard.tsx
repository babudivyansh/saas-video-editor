"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "./AuthContext";
import ToolsSidebar from "./ToolsSidebar";
import SidebarAccount from "./SidebarAccount";

// ── Voice catalogue (same as VoiceChangerTool) ───────────────────────────────
interface Voice {
  slug: string;
  name: string;
  desc: string;
  gender: "Male" | "Female";
  age: "Young" | "Middle aged" | "Mature";
  language: "English" | "Multilingual";
  color: string;
}

const VOICES: Voice[] = [
  { slug: "adam",      name: "Adam",      desc: "Adam is the most recognizable voice on TikTok used in many viral videos",            gender: "Male",   age: "Middle aged", language: "Multilingual", color: "#3b82f6" },
  { slug: "dandan",    name: "Dan Dan",   desc: "The AI voice used in Kimberly Shorts (100k+ yt channel by crayo)",                   gender: "Male",   age: "Middle aged", language: "Multilingual", color: "#6366f1" },
  { slug: "natasha",   name: "Natasha",   desc: "Natasha is the soft voice most notably used in TikTok videos for female voices",      gender: "Female", age: "Young",       language: "Multilingual", color: "#10b981" },
  { slug: "william",   name: "William",   desc: "William is the default voice used in Crayo, recommended for most use cases",          gender: "Male",   age: "Middle aged", language: "English",      color: "#ec4899" },
  { slug: "daniel",    name: "Daniel",    desc: "Deep, authoritative British voice. Perfect for documentaries and explainers",         gender: "Male",   age: "Middle aged", language: "English",      color: "#7c3aed" },
  { slug: "harry",     name: "Harry",     desc: "Bold and expressive British voice ideal for dramatic storytelling and gaming",        gender: "Male",   age: "Young",       language: "English",      color: "#f97316" },
  { slug: "liam",      name: "Liam",      desc: "Energetic and clear American voice. Great for YouTube tutorials and reviews",         gender: "Male",   age: "Young",       language: "Multilingual", color: "#0ea5e9" },
  { slug: "charlie",   name: "Charlie",   desc: "Friendly, conversational voice well suited for podcasts and storytelling",            gender: "Male",   age: "Young",       language: "Multilingual", color: "#14b8a6" },
  { slug: "thomas",    name: "Thomas",    desc: "Calm and measured voice ideal for educational content and e-learning",                gender: "Male",   age: "Middle aged", language: "English",      color: "#8b5cf6" },
  { slug: "matthew",   name: "Matthew",   desc: "Warm American narrator voice with excellent clarity for audiobooks",                  gender: "Male",   age: "Middle aged", language: "English",      color: "#06b6d4" },
  { slug: "aria",      name: "Aria",      desc: "Versatile, expressive female voice great for a wide range of content",               gender: "Female", age: "Young",       language: "Multilingual", color: "#a855f7" },
  { slug: "rachel",    name: "Rachel",    desc: "Clear, neutral American accent. The go-to voice for professional voiceovers",        gender: "Female", age: "Middle aged", language: "English",      color: "#f43f5e" },
  { slug: "bella",     name: "Bella",     desc: "Soft and soothing voice perfect for meditation guides and gentle narration",          gender: "Female", age: "Young",       language: "English",      color: "#d946ef" },
  { slug: "charlotte", name: "Charlotte", desc: "British female voice with natural warmth. Great for storytelling and lifestyle",      gender: "Female", age: "Middle aged", language: "English",      color: "#7c3aed" },
  { slug: "emily",     name: "Emily",     desc: "Young and lively American voice ideal for social media and vlogs",                   gender: "Female", age: "Young",       language: "English",      color: "#f97316" },
  { slug: "sarah",     name: "Sarah",     desc: "Confident and engaging female voice with a neutral American accent",                  gender: "Female", age: "Young",       language: "English",      color: "#f59e0b" },
  { slug: "matilda",   name: "Matilda",   desc: "Warm and nurturing voice great for educational and kids content",                     gender: "Female", age: "Middle aged", language: "English",      color: "#22c55e" },
  { slug: "freya",     name: "Freya",     desc: "Dynamic and expressive voice perfect for gaming and entertainment content",           gender: "Female", age: "Young",       language: "English",      color: "#10b981" },
  { slug: "grace",     name: "Grace",     desc: "Elegant and articulate voice suited for news-style narration and documentaries",      gender: "Female", age: "Middle aged", language: "English",      color: "#84cc16" },
];

function voiceBySlug(slug: string): Voice | null {
  return VOICES.find(v => v.slug === slug) ?? null;
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function IcGrid() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}
function IcChevronRight() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 18l6-6-6-6" /></svg>;
}
function IcStar() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>;
}
function IcFilm() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className="w-16 h-16 text-gray-300">
      <rect x="2" y="2" width="20" height="20" rx="2.18" /><path d="M7 2v20M17 2v20M2 12h20M2 7h5M17 7h5M2 17h5M17 17h5" />
    </svg>
  );
}
function IcPerson() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" className="w-16 h-16 text-gray-300">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function IcUploadArrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
    </svg>
  );
}
function IcVolume() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
    </svg>
  );
}
function IcWave() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-8 h-8 text-white">
      <path d="M2 12c0 0 2-4 4-4s4 8 6 8 4-8 6-8 4 4 4 4" />
    </svg>
  );
}
function IcX() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M18 6L6 18M6 6l12 12" /></svg>;
}
function IcSearch() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>;
}
function IcPlay() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M8 5v14l11-7z" /></svg>;
}
function IcStop() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><rect x="6" y="6" width="12" height="12" /></svg>;
}

// ── Voice subcomponents ───────────────────────────────────────────────────────
function VoiceAvatar({ voice, size = 36 }: { voice: Voice; size?: number }) {
  return (
    <span
      className="rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 select-none"
      style={{ width: size, height: size, background: voice.color, fontSize: size * 0.4 }}
    >
      {voice.name[0]}
    </span>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 px-2.5 py-0.5 text-[11px] text-slate-500 font-medium bg-white">
      {label}
    </span>
  );
}

function VoicePickerModal({
  current,
  onSelect,
  onClose,
}: {
  current: string;
  onSelect: (slug: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(current === "original" ? VOICES[0].slug : current);
  const [playingSlug, setPlayingSlug] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { audioRef.current?.pause(); onSelect(selected); onClose(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, onSelect, onClose]);

  const filtered = VOICES.filter(v => {
    if (!query) return true;
    const q = query.toLowerCase();
    return v.name.toLowerCase().includes(q) || v.gender.toLowerCase().includes(q) || v.language.toLowerCase().includes(q);
  });

  function playPreview(slug: string) {
    if (playingSlug === slug) { audioRef.current?.pause(); setPlayingSlug(null); return; }
    audioRef.current?.pause();
    const audio = new Audio();
    audioRef.current = audio;
    setPlayingSlug(slug);
    fetch("/api/tools/voice-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }) })
      .then(r => r.blob())
      .then(blob => { audio.src = URL.createObjectURL(blob); audio.onended = () => setPlayingSlug(null); audio.play().catch(() => setPlayingSlug(null)); })
      .catch(() => setPlayingSlug(null));
  }

  function handleDone() {
    audioRef.current?.pause();
    onSelect(selected);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={handleDone}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col" style={{ maxHeight: "85vh" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-7 pt-6 pb-4">
          <h2 className="text-2xl font-bold text-slate-900">Select AI Voice</h2>
          <button onClick={handleDone} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"><IcX /></button>
        </div>
        <div className="px-7 pb-4">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <span className="text-slate-400"><IcSearch /></span>
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, tag, etc." className="flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" />
          </div>
        </div>
        <div className="overflow-y-auto flex-1 px-7 pb-4">
          <div className="grid grid-cols-3 gap-3">
            {filtered.map(voice => {
              const isSel = selected === voice.slug;
              const isPlaying = playingSlug === voice.slug;
              return (
                <div key={voice.slug} onClick={() => setSelected(voice.slug)} className={`relative rounded-xl border-2 p-4 cursor-pointer transition-all ${isSel ? "border-slate-900 bg-white" : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"}`}>
                  <div className="flex items-start gap-3 mb-2">
                    <VoiceAvatar voice={voice} size={40} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-slate-900 leading-tight">{voice.name}</p>
                      <p className="text-[11px] text-slate-500 mt-1 leading-snug line-clamp-2">{voice.desc}</p>
                    </div>
                    <button onClick={e => { e.stopPropagation(); playPreview(voice.slug); }} className="flex-shrink-0 w-8 h-8 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors mt-0.5">
                      {isPlaying ? <IcStop /> : <IcPlay />}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <Tag label={voice.gender} /><Tag label={voice.age} /><Tag label={voice.language} />
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <div className="col-span-3 py-12 text-center text-sm text-slate-400">No voices match &ldquo;{query}&rdquo;</div>}
          </div>
        </div>
        <div className="px-7 py-4 border-t border-slate-100 flex justify-end">
          <button onClick={handleDone} className="inline-flex items-center gap-3 px-8 py-3 rounded-xl bg-[#335CFF] hover:opacity-90 text-white text-sm font-semibold transition-opacity">
            Done <span className="text-xs text-white/60 font-normal">Esc</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Wizard types ──────────────────────────────────────────────────────────────
type Step = "upload-video" | "select-avatar" | "select-voiceover";

type AvatarChoice =
  | { type: "nano-banana" }
  | { type: "face-swap" }
  | { type: "upload"; file: File; previewUrl: string };

// ── Main wizard ───────────────────────────────────────────────────────────────
export default function AICreatorWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const step = (searchParams.get("step") ?? "upload-video") as Step;

  const { refreshUser } = useAuth();

  // Wizard state (persists across step navigation via refs so router.push doesn't reset)
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [avatarChoice, setAvatarChoice] = useState<AvatarChoice | null>(null);
  const [voiceSlug, setVoiceSlug] = useState<string>("original");
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const steps: Step[] = ["upload-video", "select-avatar", "select-voiceover"];
  const stepIdx = steps.indexOf(step);

  const stepLabels: Record<Step, string> = {
    "upload-video": "Upload Video",
    "select-avatar": "Select Avatar",
    "select-voiceover": "Select Voiceover",
  };

  const nextEnabled =
    (step === "upload-video" && videoFile !== null) ||
    (step === "select-avatar" && avatarChoice !== null) ||
    (step === "select-voiceover");

  function goToStep(s: Step) {
    router.push(`/dashboard/ai-creator?step=${s}`);
  }

  function handleNext() {
    if (step === "upload-video") goToStep("select-avatar");
    else if (step === "select-avatar") goToStep("select-voiceover");
    else handleGenerate();
  }

  // ── Video upload ──────────────────────────────────────────────────────────
  const onVideoFile = useCallback((f: File) => {
    if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    setVideoFile(f);
    setVideoPreviewUrl(URL.createObjectURL(f));
    setErrorMsg("");
  }, [videoPreviewUrl]);

  // ── Avatar selection ──────────────────────────────────────────────────────
  const onAvatarImageFile = useCallback((f: File) => {
    if (avatarChoice?.type === "upload") URL.revokeObjectURL(avatarChoice.previewUrl);
    setAvatarChoice({ type: "upload", file: f, previewUrl: URL.createObjectURL(f) });
  }, [avatarChoice]);

  // ── Generation ────────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (generating || !videoFile || !avatarChoice) return;

    const token = localStorage.getItem("token");
    if (!token) { setErrorMsg("Please log in to use this feature."); return; }

    setGenerating(true);
    setProgress(5);
    setErrorMsg("");
    setResultUrl(null);
    setDone(false);

    try {
      const form = new FormData();
      form.append("video", videoFile);
      form.append("avatarType", avatarChoice.type);
      if (avatarChoice.type === "upload") form.append("avatarImage", avatarChoice.file);
      form.append("voiceChoice", voiceSlug);

      const res = await fetch("/api/tools/ai-creator", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      const { jobId } = await res.json();

      await new Promise<void>((resolve, reject) => {
        const interval = setInterval(async () => {
          try {
            const poll = await fetch(`/api/tools/ai-creator?jobId=${jobId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const data = await poll.json();
            if (data.progress != null) setProgress(data.progress);
            if (data.status === "done") { clearInterval(interval); resolve(); }
            else if (data.status === "error") { clearInterval(interval); reject(new Error(data.error ?? "Generation failed")); }
          } catch (err) { clearInterval(interval); reject(err); }
        }, 2000);
      });

      setProgress(100);

      const dlRes = await fetch(`/api/tools/ai-creator?jobId=${jobId}&download=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!dlRes.ok) throw new Error("Download failed");

      const blob = await dlRes.blob();
      const url = URL.createObjectURL(blob);
      setResultUrl(url);

      const a = document.createElement("a");
      a.href = url;
      a.download = "ai-creator-video.mp4";
      a.click();

      await refreshUser();
      setDone(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setGenerating(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const isLastStep = step === "select-voiceover";
  const selectedVoice = voiceSlug !== "original" ? voiceBySlug(voiceSlug) : null;

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <ToolsSidebar active="create" />
      <div className="flex flex-col flex-1 min-w-0">
      {/* Top header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2 text-gray-800">
          <IcGrid />
          <span className="text-[15px] font-semibold">AI Video</span>
        </div>

        {/* Step breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          {steps.map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (i === 0 || (i === 1 && videoFile) || (i === 2 && avatarChoice))
                    goToStep(s);
                }}
                className="flex items-center gap-1.5"
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                    i === stepIdx
                      ? "bg-blue-600 text-white"
                      : i < stepIdx
                      ? "bg-gray-200 text-gray-600"
                      : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {i + 1}
                </span>
                <span className={`text-[13px] font-medium ${i === stepIdx ? "text-gray-900" : "text-gray-400"}`}>
                  {stepLabels[s]}
                </span>
              </button>
              {i < steps.length - 1 && <IcChevronRight />}
            </span>
          ))}
        </div>

        <button
          onClick={handleNext}
          disabled={!nextEnabled || generating}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            nextEnabled && !generating
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          {isLastStep ? (
            <>
              <IcStar />
              {generating ? "Generating…" : done ? "Generate Again" : "Generate"}
            </>
          ) : (
            <>Next <IcChevronRight /></>
          )}
        </button>

        <SidebarAccount />
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden bg-gray-50 p-6">
        <div className="h-full max-w-5xl mx-auto bg-white rounded-2xl border border-gray-200 overflow-hidden flex">
          {/* ── LEFT PREVIEW PANEL ── */}
          <div className="flex-1 bg-gray-100 flex flex-col items-center justify-center border-r border-gray-200 p-8 min-h-0">
            {step === "upload-video" && (
              videoPreviewUrl ? (
                <video src={videoPreviewUrl} className="max-h-full max-w-full rounded-xl object-contain" controls muted />
              ) : (
                <div className="flex flex-col items-center gap-3 text-center">
                  <IcFilm />
                  <p className="text-sm text-gray-400 font-medium">No video selected</p>
                </div>
              )
            )}

            {step === "select-avatar" && (
              avatarChoice ? (
                avatarChoice.type === "upload" ? (
                  <img src={avatarChoice.previewUrl} className="max-h-full max-w-full rounded-xl object-contain" alt="Avatar" />
                ) : (
                  <div className="flex flex-col items-center gap-3 text-center">
                    <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center text-white text-4xl font-bold shadow-lg">
                      {avatarChoice.type === "nano-banana" ? "NB" : "FS"}
                    </div>
                    <p className="text-sm font-semibold text-gray-700">
                      {avatarChoice.type === "nano-banana" ? "Nano Banana" : "Face Swap"}
                    </p>
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center gap-3 text-center">
                  <IcPerson />
                  <p className="text-sm text-gray-400 font-medium">No avatar selected</p>
                </div>
              )
            )}

            {step === "select-voiceover" && (
              <div className="flex flex-col items-center gap-4 text-center">
                <div
                  className="w-24 h-24 rounded-full flex items-center justify-center shadow-lg"
                  style={{ background: selectedVoice ? selectedVoice.color : "#7c3aed" }}
                >
                  <IcWave />
                </div>
                <div>
                  <p className="text-base font-bold text-gray-900">
                    {selectedVoice ? selectedVoice.name : "Original Voice"}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {selectedVoice ? selectedVoice.desc : "Keep the original audio from your video"}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 text-xs text-gray-600 font-medium">
                  {voiceSlug === "original" ? "✓ No voice change" : `✓ ${selectedVoice?.name}`}
                </span>
              </div>
            )}
          </div>

          {/* ── RIGHT CONTROLS PANEL ── */}
          <div className="w-80 flex flex-col justify-center gap-3 p-6">
            {/* STEP 1 — Upload Video */}
            {step === "upload-video" && (
              <>
                <input ref={videoFileInputRef} type="file" accept="video/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onVideoFile(f); e.target.value = ""; }} />
                <button
                  onClick={() => videoFileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-sm font-semibold text-gray-700 transition-colors shadow-sm"
                >
                  <IcUploadArrow />
                  Upload Video
                </button>

                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 mt-2">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Tips for best results:</p>
                  <ul className="space-y-1.5">
                    {["Use high-quality, well-lit footage", "Vertical (9:16) works best for short-form", "Keep videos under 3 minutes"].map(tip => (
                      <li key={tip} className="flex items-start gap-1.5 text-xs text-blue-600">
                        <span className="mt-0.5 text-blue-400">•</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            {/* STEP 2 — Select Avatar */}
            {step === "select-avatar" && (
              <>
                <input ref={avatarFileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onAvatarImageFile(f); e.target.value = ""; }} />
                {[
                  { id: "upload" as const, label: "Upload", icon: <IcUploadArrow /> },
                  { id: "nano-banana" as const, label: "Nano Banana", icon: null },
                  { id: "face-swap" as const, label: "Face Swap", icon: null },
                ].map(opt => {
                  const isSelected = avatarChoice?.type === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => {
                        if (opt.id === "upload") {
                          avatarFileInputRef.current?.click();
                        } else {
                          setAvatarChoice({ type: opt.id });
                        }
                      }}
                      className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border text-sm font-semibold transition-all shadow-sm ${
                        isSelected
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
                      }`}
                    >
                      {opt.icon}
                      {opt.label}
                    </button>
                  );
                })}
              </>
            )}

            {/* STEP 3 — Select Voiceover */}
            {step === "select-voiceover" && (
              <>
                <button
                  onClick={() => setVoiceSlug("original")}
                  className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border text-sm font-semibold transition-all shadow-sm ${
                    voiceSlug === "original"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  <IcWave />
                  Use Original Voice
                </button>

                <div className="flex items-center gap-2 my-1">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400">or</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>

                <button
                  onClick={() => setShowVoicePicker(true)}
                  className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border text-sm font-semibold transition-all shadow-sm ${
                    voiceSlug !== "original"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  <IcVolume />
                  {voiceSlug !== "original" && selectedVoice ? selectedVoice.name : "Select Voice"}
                </button>

                <div className="relative">
                  <button
                    disabled
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-gray-100 bg-gray-50 text-sm font-semibold text-gray-300 cursor-not-allowed"
                  >
                    <IcUploadArrow />
                    Clone Your Voice
                  </button>
                  <span className="absolute -top-1.5 right-3 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-600">
                    ✦ Soon
                  </span>
                </div>

                {/* Error / progress */}
                {errorMsg && (
                  <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{errorMsg}</p>
                )}
                {generating && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Generating…</span><span>{progress}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="bg-blue-600 h-1.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}
                {done && resultUrl && (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
                    <span className="text-green-600 text-sm">✓</span>
                    <p className="text-xs text-green-700 font-medium flex-1">Done! Video downloaded.</p>
                    <a href={resultUrl} download="ai-creator-video.mp4" className="text-xs text-blue-600 font-medium hover:underline">Again</a>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {showVoicePicker && (
        <VoicePickerModal
          current={voiceSlug}
          onSelect={slug => setVoiceSlug(slug)}
          onClose={() => setShowVoicePicker(false)}
        />
      )}
      </div>
    </div>
  );
}
