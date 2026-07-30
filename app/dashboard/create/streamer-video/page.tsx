"use client";
import { Suspense, useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useVideoGenerate, type GenerateStatus } from "@/app/hooks/useVideoGenerate";
import { useAuth } from "@/app/components/AuthContext";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";


// ── Icons ────────────────────────────────────────────────────────────────────
function IcFilm() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M17 7h5M2 17h5M17 17h5"/></svg>;
}
function IcCloud() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg>;
}
function IcCheck() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3"><path d="M5 13l4 4L19 7"/></svg>;
}
function IcFile() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
}
function IcX() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12"/></svg>;
}
function IcArrowRight() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M5 12h14M12 5l7 7-7 7"/></svg>;
}
function IcSparkle() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M12 2l1.9 5.6L19.5 9l-5.6 1.9L12 16l-1.9-5.1L4.5 9l5.6-1.4L12 2z"/></svg>;
}
function IcChevronLeft() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M15 18l-6-6 6-6"/></svg>;
}

// ── Steps ────────────────────────────────────────────────────────────────────
const STEPS = [
  { id: "upload", label: "Upload" },
  { id: "title", label: "Title" },
];

// ── Subtitle styles (same 16 CSS tiles as Crayo) ─────────────────────────────
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
  { fontFamily: "system-ui,sans-serif", fontWeight: 800, color: "#22d3ee", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 900, color: "#84cc16", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 800, color: "#fb923c", textShadow: "0 0 12px rgba(251,146,60,.6)" },
  { fontFamily: "Impact,system-ui,sans-serif", fontWeight: 900, fontStyle: "italic", color: "#f9a8d4", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 900, color: "#fff", textTransform: "uppercase", textShadow: OUTLINE },
  { fontFamily: "system-ui,sans-serif", fontWeight: 900, color: "#fff", textTransform: "uppercase", background: "#2563eb", padding: "4px 12px", borderRadius: 6 },
  { fontFamily: "system-ui,sans-serif", fontWeight: 700, color: "#fff", background: "#000", padding: "4px 12px", borderRadius: 6 },
  { fontFamily: "system-ui,sans-serif", fontWeight: 800, color: "#c4b5fd", textTransform: "uppercase", textShadow: "0 0 10px rgba(196,181,253,.6)" },
];

// Local AuthModal component deleted in favor of global AuthModal

// ── Generating overlay + result panel ────────────────────────────────────────
function GeneratingOverlay({ status, videoUrl, error, onReset }: { status: GenerateStatus; videoUrl: string | null; error: string | null; onReset: () => void }) {
  const statusText: Partial<Record<GenerateStatus, string>> = {
    uploading: "Uploading your video…",
    creating: "Creating your project…",
    rendering: "Rendering your video — this may take 2–5 minutes…",
  };

  const fireReviewPrompt = useReviewPromptTrigger();
  const reviewPromptFiredRef = useRef(false);
  useEffect(() => {
    if (status !== "completed" || !videoUrl || reviewPromptFiredRef.current) return;
    reviewPromptFiredRef.current = true;
    fireReviewPrompt("tool_generation_complete", { featureHint: "ai_tools" }).catch(() => { /* non-critical */ });
  }, [status, videoUrl, fireReviewPrompt]);

  if (status === "completed" && videoUrl) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm flex flex-col items-center gap-5 text-center">
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
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-4 text-center">
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
function Header({
  stepIndex,
  onNext,
  onBack,
  onGenerate,
  canNext,
  canGenerate,
}: {
  stepIndex: number;
  onNext: () => void;
  onBack: () => void;
  onGenerate: () => void;
  canNext: boolean;
  canGenerate: boolean;
}) {
  return (
    <div className="sticky top-0 z-40 bg-white border-b border-gray-100 px-8 py-4" style={{ backdropFilter: "blur(25px)" }}>
      <div className="flex items-center justify-between">
        {/* Left: icon + title */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-700">
            <IcFilm />
          </div>
          <h1 className="text-lg font-medium text-black">Streamer Video</h1>
        </div>
      </div>

      {/* Step nav + action buttons */}
      <div className="flex items-center justify-between mt-4">
        {/* Step indicators */}
        <nav className="flex items-center gap-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex cursor-pointer flex-row items-center space-x-2 whitespace-nowrap px-2">
              <div
                className="flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold flex-shrink-0"
                style={{
                  background: i === stepIndex ? "#335CFF" : "#fff",
                  color: i === stepIndex ? "#fff" : "#6b7280",
                  border: i === stepIndex ? "none" : "1px solid #e5e7eb",
                }}
              >
                {i + 1}
              </div>
              <p className="font-inter text-sm" style={{ color: i === stepIndex ? "#111827" : "#6b7280" }}>
                {s.label}
              </p>
            </div>
          ))}
        </nav>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {stepIndex > 0 && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <IcChevronLeft /> Back
            </button>
          )}
          {stepIndex < STEPS.length - 1 ? (
            <button
              onClick={onNext}
              disabled={!canNext}
              className="inline-flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: canNext ? "#335CFF" : "#93c5fd" }}
            >
              Next <IcArrowRight />
            </button>
          ) : (
            <button
              onClick={onGenerate}
              disabled={!canGenerate}
              className="inline-flex items-center gap-1.5 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: canGenerate ? "#3b82f6" : "#93c5fd" }}
            >
              <IcSparkle /> Generate video
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step 1: Upload ────────────────────────────────────────────────────────────
function UploadStep({
  onFile,
  onLinkGate,
  fileName,
  onClearFile,
}: {
  onFile: (f: File) => void;
  onLinkGate: () => void;
  fileName: string | null;
  onClearFile: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState("");

  function isValidUrl(url: string) {
    return /youtube\.com|youtu\.be|tiktok\.com/.test(url);
  }

  function handleLinkSubmit() {
    if (!link.trim()) return;
    if (!isValidUrl(link)) {
      setLinkError("Please enter a valid YouTube or TikTok link.");
      return;
    }
    setLinkError("");
    onLinkGate();
  }

  const linkValid = isValidUrl(link);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center md:bg-[#F7F7F7] md:rounded-[20px] p-4 md:p-8" style={{ minHeight: "calc(100vh - 160px)" }}>
      <div className="w-full max-w-xl flex flex-col space-y-2 rounded-lg border border-gray-200 bg-white py-4">

        <div className="px-4">
          <p className="text-base text-black">Upload your video</p>
          <p className="text-xs text-gray-500 mt-0.5">Upload a video to use for your new project.</p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/mov,video/quicktime,video/webm"
          className="hidden"
          onChange={e => { if (e.target.files?.[0]) onFile(e.target.files[0]); }}
        />

        {fileName ? (
          <div className="mx-4 rounded-lg border border-blue-200 bg-blue-50 flex items-center gap-3 px-4 py-4">
            <div className="text-blue-500 flex-shrink-0"><IcFile /></div>
            <span className="text-sm font-semibold text-blue-700 flex-1 truncate">{fileName}</span>
            <button onClick={onClearFile} className="text-blue-400 hover:text-blue-600 flex-shrink-0 transition-colors">
              <IcX />
            </button>
          </div>
        ) : (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files?.[0]) onFile(e.dataTransfer.files[0]); }}
            onClick={() => inputRef.current?.click()}
            className="mx-4 flex cursor-pointer flex-col items-center justify-center space-y-3 rounded-lg border border-dashed border-gray-300 py-4 transition-all duration-300 ease-in-out md:py-8"
            style={{ borderColor: dragging ? "#93c5fd" : undefined, background: dragging ? "#eff6ff" : undefined }}
          >
            <div className="text-blue-500"><IcCloud /></div>
            <p className="text-center text-base text-gray-700">Choose a clip or drag &amp; drop it here.</p>
            <p className="text-center text-sm text-gray-400">MP4 formats, up to 50 MB.</p>
            <button
              onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
              className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 h-10"
            >
              Browse File
            </button>
          </div>
        )}

        <div className="flex items-center gap-3 mx-4 py-1">
          <div className="h-px bg-gray-100 flex-1" />
          <span className="text-sm text-gray-500">OR</span>
          <div className="h-px bg-gray-100 flex-1" />
        </div>

        <div className="px-4">
          <p className="text-sm text-gray-500 mb-2">Add Youtube or Tiktok link</p>
          <div className="flex items-center gap-2">
            <input
              value={link}
              onChange={e => { setLink(e.target.value); setLinkError(""); }}
              onKeyDown={e => e.key === "Enter" && handleLinkSubmit()}
              placeholder="https://youtube.com/watch?v=..."
              className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none"
              style={{ borderColor: linkError ? "#fca5a5" : undefined }}
            />
            <button
              onClick={handleLinkSubmit}
              className="flex w-10 h-10 flex-row items-center justify-center rounded-md p-2 transition-all duration-300 flex-shrink-0"
              style={{
                background: linkValid ? "#335CFF" : "#F7F7F7",
                color: linkValid ? "#fff" : "#CACFD8",
                cursor: link.trim() ? "pointer" : "not-allowed",
              }}
            >
              <IcArrowRight />
            </button>
          </div>
          {linkError && <p className="text-xs text-red-500 mt-1.5">{linkError}</p>}
        </div>

      </div>
    </div>
  );
}

// ── Step 2: Title + Subtitle Style ───────────────────────────────────────────
function TitleStep({
  titleText,
  onTitleChange,
  subtitleMode,
  onModeChange,
  subtitleSel,
  onSubtitleSel,
}: {
  titleText: string;
  onTitleChange: (v: string) => void;
  subtitleMode: "oneword" | "lines";
  onModeChange: (m: "oneword" | "lines") => void;
  subtitleSel: number;
  onSubtitleSel: (i: number) => void;
}) {
  const styles = subtitleMode === "oneword" ? ONE_WORD_STYLES : LINE_STYLES;
  const sample = subtitleMode === "oneword" ? "Crayo" : "The quick brown";

  return (
    <div className="px-8 pt-6 pb-10 flex flex-col space-y-4 h-full">
      {/* Title input */}
      <div className="flex flex-col space-y-2">
        <h1 className="text-lg font-medium md:text-xl text-gray-900">Select Title Text</h1>
        <input
          value={titleText}
          onChange={e => onTitleChange(e.target.value)}
          placeholder="ex: Adin Ross just did something crazy with Ray"
          className="w-full rounded-md border px-4 py-5 text-sm text-gray-800 focus:outline-none focus:ring-0 transition-colors"
          style={{ borderColor: "#E7E9EF" }}
          onFocus={e => (e.currentTarget.style.borderColor = "#4e80ed")}
          onBlur={e => (e.currentTarget.style.borderColor = "#E7E9EF")}
        />
      </div>

      {/* One Word / Lines toggle */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium" style={{ color: subtitleMode === "oneword" ? "#111827" : "#9ca3af" }}>One Word</span>
        <button
          onClick={() => { onModeChange(subtitleMode === "oneword" ? "lines" : "oneword"); onSubtitleSel(0); }}
          className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none"
          style={{ background: subtitleMode === "lines" ? "#335CFF" : "#cbd5e1" }}
        >
          <span
            className="absolute w-4 h-4 rounded-full bg-white transition-all shadow-sm"
            style={{ left: subtitleMode === "lines" ? "22px" : "2px", top: "4px" }}
          />
        </button>
        <span className="text-sm font-medium" style={{ color: subtitleMode === "lines" ? "#111827" : "#9ca3af" }}>Lines</span>
      </div>

      {/* Subtitle style tiles */}
      <div className="grid w-full grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4">
        {styles.map((st, i) => {
          const isSel = subtitleSel === i;
          return (
            <button
              key={i}
              onClick={() => onSubtitleSel(i)}
              className="group relative h-[104px] rounded-xl flex items-center justify-center px-4 transition-all overflow-hidden cursor-pointer"
              style={{ background: "#243044", border: isSel ? "2px solid #335CFF" : "2px solid transparent" }}
            >
              {isSel && (
                <span className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full text-white flex items-center justify-center shadow" style={{ background: "#335CFF" }}>
                  <IcCheck />
                </span>
              )}
              <span className="text-[22px] leading-tight text-center transition-transform duration-200 group-hover:scale-110" style={st}>{sample}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Main flow ─────────────────────────────────────────────────────────────────
function StreamerVideoFlow() {
  const router = useRouter();
  const params = useSearchParams();

  const stepParam = params.get("step") || "upload";
  const stepIndex = Math.max(0, STEPS.findIndex(s => s.id === stepParam));

  const fileName = params.get("file") || null;
  const fileRef = useRef<File | null>(null);

  const [titleText, setTitleText] = useState("");
  const [subtitleMode, setSubtitleMode] = useState<"oneword" | "lines">("oneword");
  const [subtitleSel, setSubtitleSel] = useState(0);
  const { user, openAuthModal } = useAuth();

  const { status: genStatus, videoUrl, error: genError, generateStreamerVideo, reset: resetGenerate } = useVideoGenerate();
  const isGenerating = genStatus !== "idle";

  function goTo(i: number, currentFile?: string | null) {
    const f = currentFile !== undefined ? currentFile : fileName;
    const fileQuery = f ? `&file=${encodeURIComponent(f)}` : "";
    router.push(`/dashboard/create/streamer-video?step=${STEPS[i].id}${fileQuery}`);
  }

  function handleFile(f: File) {
    if (!user) {
      openAuthModal("login", "AI Video Creator");
      return;
    }
    fileRef.current = f;
    goTo(1, f.name);
  }

  function handleClearFile() {
    fileRef.current = null;
    const url = new URL(window.location.href);
    url.searchParams.delete("file");
    router.replace(url.pathname + url.search);
  }

  async function doGenerate(token: string) {
    if (!fileRef.current) return;
    await generateStreamerVideo({ file: fileRef.current, titleText, subtitleStyleIndex: subtitleSel, token });
  }

  const canNext = stepIndex === 0 ? !!fileName : true;
  const canGenerate = !!titleText.trim() && !isGenerating;

  function handleGenerateClick() {
    if (!user) {
      openAuthModal("login", "AI Video Creator");
      return;
    }
    const token = localStorage.getItem("token");
    if (token) { void doGenerate(token); }
  }

  return (
      <main className="h-full overflow-y-auto bg-white flex flex-col">
        <Header
          stepIndex={stepIndex}
          onNext={() => goTo(stepIndex + 1)}
          onBack={() => goTo(stepIndex - 1)}
          onGenerate={handleGenerateClick}
          canNext={canNext}
          canGenerate={canGenerate}
        />

        {isGenerating ? (
          <GeneratingOverlay status={genStatus} videoUrl={videoUrl} error={genError} onReset={resetGenerate} />
        ) : (
          <div className="flex-1">
            {stepIndex === 0 && (
              <UploadStep
                onFile={handleFile}
                onLinkGate={() => openAuthModal("login", "AI Video Creator")}
                fileName={fileName}
                onClearFile={handleClearFile}
              />
            )}
            {stepIndex === 1 && (
              <TitleStep
                titleText={titleText}
                onTitleChange={setTitleText}
                subtitleMode={subtitleMode}
                onModeChange={setSubtitleMode}
                subtitleSel={subtitleSel}
                onSubtitleSel={setSubtitleSel}
              />
            )}
          </div>
        )}
      </main>
  );
}

export default function StreamerVideoPage() {
  return (
    <Suspense fallback={<div className="h-screen bg-white" />}>
      <StreamerVideoFlow />
    </Suspense>
  );
}
