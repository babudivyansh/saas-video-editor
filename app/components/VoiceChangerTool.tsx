"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { useJobPolling } from "./useJobPolling";
import { AUDIO_RATE_LABEL } from "@/lib/audio-pricing";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { VOICES, voiceBySlug, type Voice } from "@/app/components/voice-catalog";
import { useUploadEntitlement } from "@/app/hooks/useUploadEntitlement";
import { Modal } from "@/app/components/ui/Modal";
import { Button } from "@/app/components/ui/Button";
import { ToolWorkspace, ToolBadge, ToolField, CostRow, FileDrop, StageEmpty, StageProgress, RecentResults } from "@/app/components/tools/ToolWorkspace";

// Priced by length since 2026-09-26 — the route charges voiceFxCredits(duration).
const VOICE_CHANGER_RATE = AUDIO_RATE_LABEL["voice-changer"];

// ── Icons ────────────────────────────────────────────────────────────────────
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
    <span className="inline-flex items-center rounded-full border border-line px-2.5 py-0.5 text-[11px] text-fg-muted font-medium bg-panel">
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
    <Modal open onClose={handleDone} bare ariaLabel="Select AI voice" maxWidth="max-w-3xl" panelClassName="!overflow-hidden">
      <div className="flex flex-col" style={{ maxHeight: "85vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-7 pt-6 pb-4">
          <h2 className="text-2xl font-bold text-fg">Select AI Voice</h2>
          <button type="button" onClick={handleDone} aria-label="Close" className="p-1.5 rounded-lg text-fg-subtle hover:text-fg hover:bg-surface-3 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70">
            <IcX />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 sm:px-7 pb-4">
          <div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3">
            <span className="text-fg-subtle"><IcSearch /></span>
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search name, tag, etc."
              className="flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
            />
          </div>
        </div>

        {/* Grid */}
        <div className="overflow-y-auto flex-1 px-4 sm:px-7 pb-4">
          <div role="radiogroup" aria-label="Voices" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {filtered.map(voice => {
              const isSelected = selected === voice.slug;
              const isPlaying = playingSlug === voice.slug;
              return (
                <div
                  key={voice.slug}
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={voice.name}
                  tabIndex={0}
                  onClick={() => setSelected(voice.slug)}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(voice.slug); } }}
                  className={`relative rounded-xl border-2 p-4 cursor-pointer transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
                    isSelected
                      ? "border-primary bg-panel"
                      : "border-line bg-panel hover:border-line-strong hover:shadow-sm"
                  }`}
                >
                  {/* Top row: avatar + name + play btn */}
                  <div className="flex items-start gap-3 mb-2">
                    <VoiceAvatar voice={voice} size={40} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-fg leading-tight">{voice.name}</p>
                      <p className="text-[11px] text-fg-muted mt-1 leading-snug line-clamp-2">{voice.desc}</p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); playPreview(voice.slug); }}
                      className="flex-shrink-0 w-8 h-8 rounded-full border border-line bg-panel flex items-center justify-center text-fg-muted hover:bg-surface-2 transition-colors mt-0.5"
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
              <div className="col-span-3 py-12 text-center text-sm text-fg-subtle">
                No voices match &ldquo;{query}&rdquo;
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-7 py-4 border-t border-slate-100 flex justify-end">
          <button
            onClick={handleDone}
            className="inline-flex items-center gap-3 px-8 py-3 rounded-xl bg-brand hover:opacity-90 text-on-primary text-sm font-semibold transition-opacity"
          >
            Done
            <span className="text-xs text-white/60 font-normal">Esc</span>
          </button>
        </div>
      </div>
    </Modal>
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
  const [pickError, setPickError] = useState("");

  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  // Set alongside downloadUrl in the response handler below rather than
  // computed inline in JSX — Date.now() is an impure call and isn't allowed
  // during render (including inside useMemo, which is still render).
  const [downloadFilename, setDownloadFilename] = useState("voice-changed.mp3");
  const downloadedForJobId = useRef<string | null>(null);

  // Closes the window between a click and the state update that disables the
  // button — two rapid clicks could otherwise both pass the disabled check
  // and fire two charged requests.
  const submittingRef = useRef(false);

  const selectedVoice = voiceBySlug(voiceSlug);

  const ACCEPTED = ".mp3,.wav,.m4a,.ogg,.aac,.mp4,.mov,.avi,.webm";
  const { maxBytes: uploadMaxBytes, formattedMaxSize: uploadMaxSizeLabel } = useUploadEntitlement("voice-changer");
  const MAX_MB_LABEL = uploadMaxSizeLabel ?? "50 MB";

  function handleFileChange(file: File | null) {
    if (!file) return;
    setPickError("");
    if (uploadMaxBytes != null && file.size > uploadMaxBytes) {
      setPickError(`That file is too large — the limit is ${MAX_MB_LABEL}.`);
      job.reset();
      return;
    }
    if (originalPreviewUrl) URL.revokeObjectURL(originalPreviewUrl);
    setAudioFile(file);
    setOriginalPreviewUrl(URL.createObjectURL(file));
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

  const busy = job.status === "processing";
  const done = job.status === "done" && !!downloadUrl;

  return (
    <>
      {showPicker && (
        <VoicePickerModal
          current={voiceSlug}
          onSelect={setVoiceSlug}
          onClose={() => setShowPicker(false)}
        />
      )}

      <ToolWorkspace
        title="AI Voice Changer"
        icon="wave"
        badges={<ToolBadge>{VOICE_CHANGER_RATE}</ToolBadge>}
        description="Re-voice a recording while keeping your timing and emotion."
        controls={
          <>
            <ToolField label="Recording" hint="up to 90 seconds">
              <FileDrop
                accept={ACCEPTED}
                title="Click or drag audio or video here"
                hint={<>MP3, WAV, M4A, OGG, AAC, MP4, MOV, WEBM · up to {MAX_MB_LABEL}</>}
                file={audioFile}
                onFile={handleFileChange}
                onClear={busy ? undefined : () => { setAudioFile(null); setPickError(""); job.reset(); }}
                disabled={busy}
                inputLabel="Upload audio or video"
              />
              {pickError && <p role="alert" className="text-[12.5px] text-error">{pickError}</p>}
            </ToolField>

            <ToolField label="New voice">
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface-1 px-3.5 py-3 text-left transition-colors hover:border-line-strong"
              >
                <VoiceAvatar voice={selectedVoice} size={32} />
                <span className="flex-1 text-sm font-medium text-fg">{selectedVoice.name}</span>
                <span className="text-[12px] font-semibold text-fg-muted">Change</span>
              </button>
            </ToolField>

            <ToolField label="Speed" hint={<span className="tabular-nums">{speed.toFixed(2)}×</span>}>
              <input
                type="range" min={0.7} max={1.2} step={0.01} value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                aria-label="Speed"
                className="w-full accent-[var(--primary)]"
              />
            </ToolField>

            <label className="flex cursor-pointer select-none items-center justify-between gap-3 rounded-xl border border-line bg-surface-1 px-3.5 py-3">
              <span className="text-[13px] text-fg">Remove background noise</span>
              <input type="checkbox" checked={removeNoise} onChange={(e) => setRemoveNoise(e.target.checked)} className="h-4 w-4 cursor-pointer accent-[var(--primary)]" />
            </label>
          </>
        }
        footer={
          <>
            {job.status === "error" && job.error && (
              <div role="alert" className="flex items-center justify-between gap-2 rounded-lg bg-error/10 px-3 py-2 text-xs text-error">
                <span>{job.error}</span>
                <button type="button" onClick={() => void handleSubmit()} className="flex-shrink-0 font-semibold underline underline-offset-2">Retry</button>
              </div>
            )}
            {job.status === "cancelled" && <p className="text-xs text-fg-muted">Cancelled — your credits were refunded.</p>}
            <CostRow right={user ? `You have ${user.credits.toLocaleString()}` : undefined}>
              <span className="font-semibold text-fg">{VOICE_CHANGER_RATE}</span> · minimum 1
            </CostRow>
            <Button type="button" className="w-full" onClick={() => void handleSubmit()} disabled={!audioFile || busy} loading={busy}>
              {busy ? "Processing…" : "Change voice"}
            </Button>
          </>
        }
        stageTitle="Compare"
        stageActions={
          done ? (
            <a href={downloadUrl!} download={downloadFilename} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-fg hover:bg-surface-3">
              <IcDownload /> Download MP3
            </a>
          ) : undefined
        }
        stage={
          busy ? (
            <StageProgress label="Changing the voice…" progress={job.progress} onCancel={() => void job.cancel()} cancelLabel="Cancel" />
          ) : originalPreviewUrl && audioFile ? (
            <div className="flex flex-1 flex-col gap-3">
              <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-1 p-4">
                <p className="text-[12px] font-semibold text-fg-muted">Original · {audioFile.name}</p>
                <audio src={originalPreviewUrl} controls className="w-full" />
              </div>
              <div className={`flex flex-col gap-2 rounded-xl border p-4 ${done ? "border-primary/50 bg-primary/5" : "border-dashed border-line-strong bg-surface-1"}`}>
                <p className="text-[12px] font-semibold text-fg-muted">Changed · {selectedVoice.name}</p>
                {done ? <audio src={downloadUrl!} controls className="w-full" /> : <p className="text-[13px] text-fg-subtle">Press “Change voice” to hear it here.</p>}
              </div>
              {done && <p className="text-[12px] text-fg-subtle">Downloaded and saved to your Assets</p>}
            </div>
          ) : (
            <StageEmpty icon="wave" title="Before and after appear here">
              Add a recording on the left, pick a voice, and compare the two side by side.
            </StageEmpty>
          )
        }
        below={user ? <RecentResults source="voice-changer" refreshKey={downloadUrl} /> : undefined}
      />
    </>
  );
}
