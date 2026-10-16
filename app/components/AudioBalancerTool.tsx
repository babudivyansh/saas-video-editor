"use client";
import { useCallback, useRef, useState, useEffect } from "react";
import { useJobPolling } from "./useJobPolling";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { useUploadEntitlement } from "@/app/hooks/useUploadEntitlement";
import { useAuth } from "@/app/components/AuthContext";
import { Button } from "@/app/components/ui/Button";
import { ToolWorkspace, ToolBadge, ToolField, CostRow, FileDrop, OptionCards, StageEmpty, StageProgress } from "@/app/components/tools/ToolWorkspace";

interface BalanceMode {
  id: string;
  label: string;
  sub: string;
}

const BALANCE_MODES: BalanceMode[] = [
  { id: "left-only", label: "Use left side", sub: "Left channel in both ears" },
  { id: "balance-center", label: "Even out volume", sub: "Normalise loudness" },
  { id: "right-only", label: "Use right side", sub: "Right channel in both ears" },
];

function fmtMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}


function IcDownload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

export default function AudioBalancerTool() {
  const job = useJobPolling({ toolSlug: "audio-balancer", token: null, requireAuth: false });
  const fireReviewPrompt = useReviewPromptTrigger();
  const { formattedMaxSize: uploadMaxSizeLabel } = useUploadEntitlement("audio-balancer");
  // Sent with the upload so the route applies this user's plan cap — without
  // it every caller counted as anonymous (lib/upload-policy ANONYMOUS_MAX_BYTES).
  const { token } = useAuth();
  const submittingRef = useRef(false);
  const downloadedForJobId = useRef<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [balanceMode, setBalanceMode] = useState("balance-center");
  const [realtime, setRealtime] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

  const startTimeRef = useRef(0);

  useEffect(() => {
    return () => {
      if (outputUrl) URL.revokeObjectURL(outputUrl);
      if (originalUrl) URL.revokeObjectURL(originalUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time-multiple estimate, recomputed whenever the poll loop reports
  // fresh progress.
  useEffect(() => {
    if (job.status !== "processing") return;
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    if (durationSec > 0 && elapsed > 0) {
      setRealtime((durationSec * (job.progress / 100)) / elapsed);
    }
  }, [job.progress, job.status, durationSec]);

  function onPick(list: FileList | File[] | null) {
    if (!list || list.length === 0) return;
    const f = list[0];
    setFile(f);
    job.reset();
    setOutputBlob(null);
    if (outputUrl) { URL.revokeObjectURL(outputUrl); setOutputUrl(null); }
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    setOriginalUrl(URL.createObjectURL(f));
    const url = URL.createObjectURL(f);
    const media = document.createElement("video");
    media.preload = "metadata";
    media.onloadedmetadata = () => {
      setDurationSec(Number.isFinite(media.duration) ? media.duration : 0);
      URL.revokeObjectURL(url);
    };
    media.onerror = () => { setDurationSec(0); URL.revokeObjectURL(url); };
    media.src = url;
  }

  function clearFile() {
    setFile(null);
    if (originalUrl) { URL.revokeObjectURL(originalUrl); setOriginalUrl(null); }
    job.reset();
    setOutputBlob(null);
    if (outputUrl) { URL.revokeObjectURL(outputUrl); setOutputUrl(null); }
  }

  const handleBalance = useCallback(async () => {
    if (!file || job.status === "processing") return;
    if (submittingRef.current) return;
    submittingRef.current = true;

    setRealtime(0);
    startTimeRef.current = Date.now();
    try {
      await job.start(async () => {
        const form = new FormData();
        form.append("file", file);
        form.append("mode", balanceMode);
        const startRes = await fetch("/api/tools/audio-balancer", {
          method: "POST",
          body: form,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!startRes.ok) {
          const json = await startRes.json().catch(() => ({})) as { error?: string };
          throw new Error(json.error ?? `Server error (${startRes.status})`);
        }
        return (await startRes.json()) as { jobId: string };
      });
    } finally {
      submittingRef.current = false;
    }
  }, [file, balanceMode, job, token]);

  // Once the job is done, fetch the balanced file.
  useEffect(() => {
    if (job.status !== "done" || !job.jobId) return;
    if (downloadedForJobId.current === job.jobId) return;
    downloadedForJobId.current = job.jobId;
    fireReviewPrompt("tool_generation_complete", { featureHint: "ai_tools" }).catch(() => { /* non-critical */ });

    (async () => {
      try {
        const fileRes = await fetch(`/api/tools/audio-balancer?jobId=${job.jobId}&download=1`);
        if (!fileRes.ok) throw new Error("Failed to fetch balanced file");
        const blob = await fileRes.blob();
        const url = URL.createObjectURL(blob);
        setOutputBlob(blob);
        setOutputUrl(url);
      } catch {
        // Leave stage at "done" with no output — user can hit "Balance Again".
      }
    })();
  }, [job.status, job.jobId, fireReviewPrompt]);

  function handleDownload() {
    if (!outputUrl || !file) return;
    const base = file.name.replace(/\.[^.]+$/, "");
    const a = document.createElement("a");
    a.href = outputUrl;
    a.download = `${base}-balanced.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function balanceAgain() {
    job.reset();
    setOutputBlob(null);
    if (outputUrl) { URL.revokeObjectURL(outputUrl); setOutputUrl(null); }
  }

  const stage = file ? (job.status === "idle" ? "ready" : job.status) : "idle";
  const canSubmit = stage === "ready" || stage === "error";
  const busy = stage === "processing";
  const modeLocked = stage === "processing" || stage === "done";
  const modeLabel = BALANCE_MODES.find(m => m.id === balanceMode)?.label ?? balanceMode;

  return (
    <ToolWorkspace
      title="Audio Balancer"
      icon="balance"
      badges={<ToolBadge tone="free">Free</ToolBadge>}
      description="Fix audio that only plays in one ear, or even out the volume."
      controls={
        <>
          <ToolField label="Audio or video">
            <FileDrop
              accept="audio/*,video/*"
              title="Click or drag audio or video here"
              hint={<>MP3, WAV, AAC, OGG, FLAC, MP4, MOV, MKV · up to {uploadMaxSizeLabel ?? "500 MB"}</>}
              file={file}
              onFile={(f) => onPick([f])}
              onClear={busy ? undefined : clearFile}
              disabled={busy}
              inputLabel="Upload audio or video"
            />
          </ToolField>
          <ToolField label="Fix">
            <OptionCards
              name="balance-mode"
              value={balanceMode}
              onChange={setBalanceMode}
              disabled={modeLocked}
              columns={1}
              options={BALANCE_MODES.map(m => [m.id, m.label, m.sub] as const)}
            />
          </ToolField>
        </>
      }
      footer={
        <>
          {stage === "error" && job.error && <p role="alert" className="text-sm text-error">{job.error}</p>}
          <CostRow right="MP3 output"><span className="font-semibold text-fg">Free</span></CostRow>
          {stage === "done" ? (
            <Button type="button" className="w-full" variant="secondary" onClick={balanceAgain}>Balance again</Button>
          ) : (
            <Button type="button" className="w-full" onClick={() => void handleBalance()} disabled={!canSubmit} loading={busy}>
              {busy ? "Balancing…" : "Balance audio"}
            </Button>
          )}
        </>
      }
      stageTitle="Listen"
      stageActions={
        stage === "done" && outputUrl ? (
          <Button type="button" size="sm" onClick={handleDownload}><span className="inline-flex items-center gap-2"><IcDownload /> Download MP3</span></Button>
        ) : undefined
      }
      stage={
        busy ? (
          <StageProgress label={realtime > 0 ? `Balancing… about ${realtime.toFixed(1)}× real time` : "Balancing audio levels…"} progress={job.progress} />
        ) : file && originalUrl ? (
          <div className="flex flex-1 flex-col gap-3">
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface-1 p-4">
              <p className="text-[12px] font-semibold text-fg-muted">Original · {file.name}</p>
              <audio src={originalUrl} controls className="w-full" />
            </div>
            <div className={`flex flex-col gap-2 rounded-xl border p-4 ${stage === "done" && outputUrl ? "border-primary/50 bg-primary/5" : "border-dashed border-line-strong bg-surface-1"}`}>
              <p className="text-[12px] font-semibold text-fg-muted">After · {modeLabel}</p>
              {stage === "done" && outputUrl
                ? <audio src={outputUrl} controls className="w-full" />
                : <p className="text-[13px] text-fg-subtle">Pick a fix and press “Balance audio” to hear it here.</p>}
            </div>
            {stage === "done" && outputBlob && (
              <p className="text-[12px] text-fg-subtle">{fmtMB(file.size)} → {fmtMB(outputBlob.size)} · MP3</p>
            )}
          </div>
        ) : (
          <StageEmpty icon="balance" title="Compare the original and the fix here">
            Add a file on the left. Headphones make the difference easiest to hear.
          </StageEmpty>
        )
      }
    />
  );
}
