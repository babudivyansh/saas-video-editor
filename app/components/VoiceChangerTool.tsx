"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { useJobPolling } from "./useJobPolling";
import { TOOL_COSTS } from "@/lib/tool-costs";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";

const VOICE_CHANGER_CREDIT_COST = TOOL_COSTS["voice-changer"].creditCost;

// ── Voice catalogue ──────────────────────────────────────────────────────────
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
  { slug: "adam",      name: "Adam",        desc: "Adam is the most recognizable voice on TikTok used in many viral videos",             gender: "Male",   age: "Middle aged", language: "Multilingual", color: "#3b82f6" },
  { slug: "dandan",    name: "Dan Dan",     desc: "The AI voice used in Kimberly Shorts (100k+ yt channel by crayo)",                    gender: "Male",   age: "Middle aged", language: "Multilingual", color: "#6366f1" },
  { slug: "natasha",   name: "Natasha",     desc: "Natasha is the soft voice most notably used in TikTok videos for female voices",       gender: "Female", age: "Young",       language: "Multilingual", color: "#10b981" },
  { slug: "amir1",     name: "Amir #1",     desc: "The one and only built-different sir Uber driver",                                     gender: "Male",   age: "Young",       language: "Multilingual", color: "#f59e0b" },
  { slug: "amir2",     name: "Amir #2 (Ameer)", desc: "Amir's brother who is rivaling on doordash",                                     gender: "Male",   age: "Young",       language: "Multilingual", color: "#22c55e" },
  { slug: "william",   name: "William",     desc: "William is the default voice used in Crayo, recommended for most use cases",           gender: "Male",   age: "Middle aged", language: "English",      color: "#ec4899" },
  { slug: "daniel",    name: "Daniel",      desc: "Deep, authoritative British voice. Perfect for documentaries and explainers",          gender: "Male",   age: "Middle aged", language: "English",      color: "#7c3aed" },
  { slug: "harry",     name: "Harry",       desc: "Bold and expressive British voice ideal for dramatic storytelling and gaming",         gender: "Male",   age: "Young",       language: "English",      color: "#f97316" },
  { slug: "liam",      name: "Liam",        desc: "Energetic and clear American voice. Great for YouTube tutorials and reviews",          gender: "Male",   age: "Young",       language: "Multilingual", color: "#0ea5e9" },
  { slug: "charlie",   name: "Charlie",     desc: "Friendly, conversational voice well suited for podcasts and storytelling",             gender: "Male",   age: "Young",       language: "Multilingual", color: "#14b8a6" },
  { slug: "thomas",    name: "Thomas",      desc: "Calm and measured voice ideal for educational content and e-learning",                 gender: "Male",   age: "Middle aged", language: "English",      color: "#8b5cf6" },
  { slug: "matthew",   name: "Matthew",     desc: "Warm American narrator voice with excellent clarity for audiobooks",                   gender: "Male",   age: "Middle aged", language: "English",      color: "#06b6d4" },
  { slug: "aria",      name: "Aria",        desc: "Versatile, expressive female voice great for a wide range of content",                gender: "Female", age: "Young",       language: "Multilingual", color: "#a855f7" },
  { slug: "rachel",    name: "Rachel",      desc: "Clear, neutral American accent. The go-to voice for professional voiceovers",         gender: "Female", age: "Middle aged", language: "English",      color: "#f43f5e" },
  { slug: "bella",     name: "Bella",       desc: "Soft and soothing voice perfect for meditation guides and gentle narration",           gender: "Female", age: "Young",       language: "English",      color: "#d946ef" },
  { slug: "charlotte", name: "Charlotte",   desc: "British female voice with natural warmth. Great for storytelling and lifestyle",       gender: "Female", age: "Middle aged", language: "English",      color: "#7c3aed" },
  { slug: "emily",     name: "Emily",       desc: "Young and lively American voice ideal for social media and vlogs",                    gender: "Female", age: "Young",       language: "English",      color: "#f97316" },
  { slug: "sarah",     name: "Sarah",       desc: "Confident and engaging female voice with a neutral American accent",                   gender: "Female", age: "Young",       language: "English",      color: "#f59e0b" },
  { slug: "matilda",   name: "Matilda",     desc: "Warm and nurturing voice great for educational and kids content",                      gender: "Female", age: "Middle aged", language: "English",      color: "#22c55e" },
  { slug: "freya",     name: "Freya",       desc: "Dynamic and expressive voice perfect for gaming and entertainment content",            gender: "Female", age: "Young",       language: "English",      color: "#10b981" },
  { slug: "grace",     name: "Grace",       desc: "Elegant and articulate voice suited for news-style narration and documentaries",       gender: "Female", age: "Middle aged", language: "English",      color: "#84cc16" },
];

function voiceBySlug(slug: string): Voice {
  return VOICES.find(v => v.slug === slug) ?? VOICES[0];
}

// ── Icons ────────────────────────────────────────────────────────────────────
function IcMic() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 10a7 7 0 0014 0M12 19v3M8 22h8" />
    </svg>
  );
}
function IcSwap() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M7 16l-4-4 4-4M3 12h13M17 8l4 4-4 4M21 12H8" />
    </svg>
  );
}
function IcCloud() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
      <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
    </svg>
  );
}
function IcX() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
function IcSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
    </svg>
  );
}
function IcPlay() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M8 5v14l11-7z" /></svg>;
}
function IcStop() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><rect x="6" y="6" width="12" height="12" /></svg>;
}
function IcDownload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

// ── Voice avatar ─────────────────────────────────────────────────────────────
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

// ── Tag pill ─────────────────────────────────────────────────────────────────
function Tag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 px-2.5 py-0.5 text-[11px] text-slate-500 font-medium bg-white">
      {label}
    </span>
  );
}

// ── Voice Picker Modal ────────────────────────────────────────────────────────
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
  const [selected, setSelected] = useState(current);
  const [playingSlug, setPlayingSlug] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onSelect(selected); onClose(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, onSelect, onClose]);

  const filtered = VOICES.filter(v => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      v.name.toLowerCase().includes(q) ||
      v.gender.toLowerCase().includes(q) ||
      v.age.toLowerCase().includes(q) ||
      v.language.toLowerCase().includes(q)
    );
  });

  function playPreview(slug: string) {
    if (playingSlug === slug) {
      audioRef.current?.pause();
      setPlayingSlug(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio();
    audioRef.current = audio;
    setPlayingSlug(slug);
    fetch("/api/tools/voice-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    })
      .then(r => r.blob())
      .then(blob => {
        audio.src = URL.createObjectURL(blob);
        audio.onended = () => setPlayingSlug(null);
        audio.play().catch(() => setPlayingSlug(null));
      })
      .catch(() => setPlayingSlug(null));
  }

  function handleDone() {
    audioRef.current?.pause();
    onSelect(selected);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={handleDone}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col"
        style={{ maxHeight: "85vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-7 pt-6 pb-4">
          <h2 className="text-2xl font-bold text-slate-900">Select AI Voice</h2>
          <button onClick={handleDone} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <IcX />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 sm:px-7 pb-4">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <span className="text-slate-400"><IcSearch /></span>
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search name, tag, etc."
              className="flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Grid */}
        <div className="overflow-y-auto flex-1 px-4 sm:px-7 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {filtered.map(voice => {
              const isSelected = selected === voice.slug;
              const isPlaying = playingSlug === voice.slug;
              return (
                <div
                  key={voice.slug}
                  onClick={() => setSelected(voice.slug)}
                  className={`relative rounded-xl border-2 p-4 cursor-pointer transition-all ${
                    isSelected
                      ? "border-slate-900 bg-white"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                  }`}
                >
                  {/* Top row: avatar + name + play btn */}
                  <div className="flex items-start gap-3 mb-2">
                    <VoiceAvatar voice={voice} size={40} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-slate-900 leading-tight">{voice.name}</p>
                      <p className="text-[11px] text-slate-500 mt-1 leading-snug line-clamp-2">{voice.desc}</p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); playPreview(voice.slug); }}
                      className="flex-shrink-0 w-8 h-8 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors mt-0.5"
                      title="Preview voice"
                    >
                      {isPlaying ? <IcStop /> : <IcPlay />}
                    </button>
                  </div>

                  {/* Tag pills */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    <Tag label={voice.gender} />
                    <Tag label={voice.age} />
                    <Tag label={voice.language} />
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-3 py-12 text-center text-sm text-slate-400">
                No voices match &ldquo;{query}&rdquo;
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-7 py-4 border-t border-slate-100 flex justify-end">
          <button
            onClick={handleDone}
            className="inline-flex items-center gap-3 px-8 py-3 rounded-xl bg-[#335CFF] hover:opacity-90 text-white text-sm font-semibold transition-opacity"
          >
            Done
            <span className="text-xs text-white/60 font-normal">Esc</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main tool ────────────────────────────────────────────────────────────────
export default function VoiceChangerTool() {
  const { user, token, openAuthModal, refreshUser } = useAuth();
  const job = useJobPolling({ toolSlug: "voice-changer", token });
  const fireReviewPrompt = useReviewPromptTrigger();

  const [voiceSlug, setVoiceSlug] = useState("adam");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState<string | null>(null);
  const [removeNoise, setRemoveNoise] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showPicker, setShowPicker] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [compareView, setCompareView] = useState<"before" | "after">("after");

  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  // Set alongside downloadUrl in the response handler below rather than
  // computed inline in JSX — Date.now() is an impure call and isn't allowed
  // during render (including inside useMemo, which is still render).
  const [downloadFilename, setDownloadFilename] = useState("voice-changed.mp3");
  const downloadedForJobId = useRef<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Closes the window between a click and the state update that disables the
  // button — two rapid clicks could otherwise both pass the disabled check
  // and fire two charged requests.
  const submittingRef = useRef(false);

  const selectedVoice = voiceBySlug(voiceSlug);

  const ACCEPTED = ".mp3,.wav,.m4a,.ogg,.aac,.mp4,.mov,.avi,.webm";
  const MAX_MB = 50;

  function handleFileChange(file: File | null) {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      job.reset();
      return;
    }
    if (originalPreviewUrl) URL.revokeObjectURL(originalPreviewUrl);
    setAudioFile(file);
    setOriginalPreviewUrl(URL.createObjectURL(file));
    setCompareView("after");
    job.reset();
    if (downloadUrl) { URL.revokeObjectURL(downloadUrl); setDownloadUrl(null); }
  }

  // Revoke held object URLs on unmount.
  useEffect(() => {
    return () => {
      if (originalPreviewUrl) URL.revokeObjectURL(originalPreviewUrl);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!user) { openAuthModal("login", "AI Voice Changer"); return; }
    if (!audioFile) return;
    if (!token) { openAuthModal("login", "AI Voice Changer"); return; }
    if (submittingRef.current) return;

    if (downloadUrl) { URL.revokeObjectURL(downloadUrl); setDownloadUrl(null); }
    submittingRef.current = true;

    const idempotencyKey = crypto.randomUUID();
    try {
      await job.start(async () => {
        const form = new FormData();
        form.append("audio", audioFile);
        form.append("voiceSlug", voiceSlug);
        form.append("removeNoise", String(removeNoise));
        form.append("speed", String(speed));
        form.append("idempotencyKey", idempotencyKey);

        const startRes = await fetch("/api/tools/voice-changer", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        if (!startRes.ok) {
          const j = await startRes.json().catch(() => ({})) as { error?: string };
          throw new Error(j.error ?? `Server error (${startRes.status})`);
        }
        return (await startRes.json()) as { jobId: string };
      });
    } finally {
      submittingRef.current = false;
    }
  }, [user, audioFile, voiceSlug, removeNoise, speed, downloadUrl, token, openAuthModal, job]);

  // Once the job is done, fetch the result and trigger a download — mirrors
  // the previous inline behavior but now driven by the shared poll status.
  useEffect(() => {
    if (job.status !== "done" || !job.jobId || !token) return;
    if (downloadedForJobId.current === job.jobId) return;
    downloadedForJobId.current = job.jobId;
    fireReviewPrompt("tool_generation_complete", { featureHint: "ai_tools" }).catch(() => { /* non-critical */ });

    (async () => {
      try {
        const fileRes = await fetch(`/api/tools/voice-changer?jobId=${job.jobId}&download=1`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!fileRes.ok) throw new Error("Failed to download result");
        const blob = await fileRes.blob();
        const url = URL.createObjectURL(blob);
        const filename = `voice-changed-${Date.now()}.mp3`;
        setDownloadUrl(url);
        setDownloadFilename(filename);

        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        void refreshUser();
      } catch {
        // The job itself succeeded; a failed download fetch just means the
        // user has to use "Download again" — no need to flip to an error state.
      }
    })();
  }, [job.status, job.jobId, token, refreshUser, fireReviewPrompt]);

  return (
    <>
      {showPicker && (
        <VoicePickerModal
          current={voiceSlug}
          onSelect={setVoiceSlug}
          onClose={() => setShowPicker(false)}
        />
      )}

      <div className="flex items-start justify-center min-h-[calc(100vh-120px)] px-4 py-10">
        <div className="w-full max-w-[520px]">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

            {/* Card header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                <IcMic />
              </div>
              <div>
                <h1 className="text-sm font-semibold text-slate-800 leading-tight">AI Voice Changer</h1>
                <p className="text-xs text-slate-400 mt-0.5">Transform any voice in audio or video files</p>
              </div>
            </div>

            <div className="px-6 py-5 flex flex-col gap-5">

              {/* Target Voice */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Target Voice
                </label>
                <button
                  onClick={() => setShowPicker(true)}
                  className="w-full flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                >
                  <VoiceAvatar voice={selectedVoice} size={32} />
                  <span className="flex-1 text-sm font-medium text-slate-700">{selectedVoice.name}</span>
                  <span className="text-slate-400"><IcSwap /></span>
                </button>
              </div>

              {/* Upload File */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Upload File
                </label>

                {audioFile ? (
                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="w-8 h-8 rounded-lg bg-[#335CFF]/10 flex items-center justify-center text-[#335CFF] flex-shrink-0">
                      <IcMic />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{audioFile.name}</p>
                      <p className="text-[11px] text-slate-400">{(audioFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <button
                      onClick={() => { setAudioFile(null); job.reset(); }}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                      <IcX />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={e => {
                      e.preventDefault();
                      setDragging(false);
                      handleFileChange(e.dataTransfer.files[0] ?? null);
                    }}
                    className={`rounded-xl border-2 border-dashed px-6 py-8 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
                      dragging ? "border-[#335CFF] bg-blue-50" : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    <div className="text-slate-400"><IcCloud /></div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-slate-700">Upload audio/video</p>
                      <p className="text-xs text-slate-400 mt-1">Drag and drop or click to browse</p>
                    </div>
                    <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                      .mp3, .wav, .m4a, .ogg, .aac, .mp4, .mov, .avi, .webm &bull; Max {MAX_MB} MB
                    </p>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED}
                  className="hidden"
                  onChange={e => handleFileChange(e.target.files?.[0] ?? null)}
                />
              </div>

              {/* Remove background noise */}
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={removeNoise}
                  onChange={e => setRemoveNoise(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 accent-[#335CFF] cursor-pointer"
                />
                <span className="text-sm text-slate-600">Remove background noise</span>
              </label>

              {/* Speed */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Speed</label>
                  <span className="text-xs font-medium text-slate-600 tabular-nums">{speed.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min={0.7}
                  max={1.2}
                  step={0.01}
                  value={speed}
                  onChange={e => setSpeed(parseFloat(e.target.value))}
                  className="w-full accent-[#335CFF]"
                />
              </div>

              {/* Progress */}
              {job.status === "processing" && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-slate-500">Changing voice…</span>
                    <span className="text-xs font-medium text-slate-600">{job.progress}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#335CFF] rounded-full transition-all duration-300" style={{ width: `${job.progress}%` }} />
                  </div>
                  <button
                    onClick={() => void job.cancel()}
                    className="mt-2 text-xs font-medium text-slate-400 hover:text-red-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Error */}
              {job.status === "error" && job.error && (
                <div className="flex items-center justify-between gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <span>{job.error}</span>
                  <button onClick={() => void handleSubmit()} className="font-semibold underline underline-offset-2 hover:text-red-800 flex-shrink-0">
                    Retry
                  </button>
                </div>
              )}

              {job.status === "cancelled" && (
                <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  Cancelled — your credit was refunded.
                </p>
              )}

              {/* Before/after comparison + download */}
              {job.status === "done" && downloadUrl && (
                <div className="space-y-2">
                  <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                    <button
                      onClick={() => setCompareView("before")}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${compareView === "before" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                    >
                      Before
                    </button>
                    <button
                      onClick={() => setCompareView("after")}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${compareView === "after" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                    >
                      After
                    </button>
                  </div>
                  {originalPreviewUrl && (
                    <audio
                      key={compareView}
                      src={compareView === "before" ? originalPreviewUrl : downloadUrl}
                      controls
                      className="w-full"
                    />
                  )}
                  <a
                    href={downloadUrl}
                    download={downloadFilename}
                    className="flex items-center justify-center gap-2 w-full rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-semibold py-2.5 hover:bg-emerald-100 transition-colors"
                  >
                    <IcDownload /> Download again
                  </a>
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!audioFile || job.status === "processing"}
                className="w-full rounded-xl bg-[#335CFF] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 transition-opacity flex items-center justify-center gap-2"
              >
                {job.status === "processing" ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Processing…
                  </>
                ) : "Change Voice"}
              </button>

              {user && (
                <p className="text-center text-[11px] text-slate-400">
                  Uses {VOICE_CHANGER_CREDIT_COST} credit{VOICE_CHANGER_CREDIT_COST !== 1 ? "s" : ""} &bull; You have {user.credits} credit{user.credits !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
