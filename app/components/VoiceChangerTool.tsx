"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { useJobPolling } from "./useJobPolling";
import { AUDIO_RATE_LABEL } from "@/lib/audio-pricing";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { useVoiceCatalog } from "@/app/components/voices/useVoiceCatalog";
import VoiceLibraryPicker, { VoiceAvatar, voiceLanguageLabel } from "@/app/components/voices/VoiceLibraryPicker";
import { useUploadEntitlement } from "@/app/hooks/useUploadEntitlement";
import { Button } from "@/app/components/ui/Button";
import { ToolWorkspace, ToolBadge, ToolField, CostRow, FileDrop, StageEmpty, StageProgress, RecentResults } from "@/app/components/tools/ToolWorkspace";

// Priced by length since 2026-09-26 — the route charges voiceFxCredits(duration).
const VOICE_CHANGER_RATE = AUDIO_RATE_LABEL["voice-changer"];

// ── Icons ────────────────────────────────────────────────────────────────────
function IcDownload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

// ── Main tool ────────────────────────────────────────────────────────────────
export default function VoiceChangerTool() {
  const { user, token, openAuthModal, refreshUser } = useAuth();
  const job = useJobPolling({ toolSlug: "voice-changer", token });
  const fireReviewPrompt = useReviewPromptTrigger();

  // The same live catalogue and picker as the voiceover tool — it had its own
  // modal over a compiled-in list of 22.
  const catalog = useVoiceCatalog();
  const [voiceSlug, setVoiceSlug] = useState("adam");
  const [liked, setLiked] = useState<Set<string>>(new Set());
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

  const selectedVoice = catalog.voices.find((v) => v.slug === voiceSlug) ?? catalog.voices[0];
  const likedKey = user ? `voiceover_liked:${user.id}` : "voiceover_liked:guest";
  useEffect(() => {
    try { setLiked(new Set(JSON.parse(localStorage.getItem(likedKey) ?? "[]"))); } catch { setLiked(new Set()); }
  }, [likedKey]);
  const toggleLike = useCallback((slug: string) => {
    setLiked((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      try { localStorage.setItem(likedKey, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, [likedKey]);

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
      <VoiceLibraryPicker
        open={showPicker}
        onClose={() => setShowPicker(false)}
        voices={catalog.voices}
        value={voiceSlug}
        onSelect={(v) => { setVoiceSlug(v.slug); setShowPicker(false); }}
        favourites={liked}
        onToggleFavourite={toggleLike}
      />

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
                aria-haspopup="dialog"
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface-1 px-3.5 py-3 text-left transition-colors hover:border-line-strong"
              >
                {selectedVoice && <VoiceAvatar voice={selectedVoice} size={32} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{selectedVoice?.label ?? "Choose a voice"}</span>
                  {selectedVoice && <span className="block truncate text-[12px] text-fg-subtle">{voiceLanguageLabel(selectedVoice)}</span>}
                </span>
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
                <p className="text-[12px] font-semibold text-fg-muted">Changed · {selectedVoice?.label}</p>
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
