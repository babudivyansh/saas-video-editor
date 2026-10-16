"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { useJobPolling } from "./useJobPolling";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { useUploadEntitlement } from "@/app/hooks/useUploadEntitlement";
import { Button } from "@/app/components/ui/Button";
import { ToolPlanGate, useToolAccess } from "@/app/components/ToolPlanGate";
import { ToolWorkspace, ToolBadge, CostRow, StageEmpty, StageProgress, RecentResults } from "@/app/components/tools/ToolWorkspace";

// Must match CREDIT_COST in app/api/tools/face-swap/route.ts.
const CREDIT_COST = 2;

function IcUpload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6" aria-hidden="true">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
    </svg>
  );
}
function IcX() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
function IcDownload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

interface ImageSlot {
  file: File | null;
  preview: string | null;
}

const ACCEPTED = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

function ImageDropZone({
  label,
  sublabel,
  slot,
  disabled,
  onPick,
  onClear,
  onReject,
}: {
  label: string;
  sublabel: string;
  slot: ImageSlot;
  disabled: boolean;
  onPick: (f: File) => void;
  onClear: () => void;
  onReject: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { maxBytes: uploadMaxBytes, formattedMaxSize } = useUploadEntitlement("face-swap");

  function pick(files: FileList | null) {
    if (!files || files.length === 0) return;
    const f = files[0];
    // These used to be dropped silently — the box just did nothing.
    if (!ACCEPTED.includes(f.type)) { onReject("Use a PNG, JPG or WEBP photo."); return; }
    if (uploadMaxBytes != null && f.size > uploadMaxBytes) { onReject(`That photo is too large — the limit is ${formattedMaxSize ?? "10 MB"}.`); return; }
    onPick(f);
  }

  return (
    <div className="flex-1 min-w-0">
      <p className="text-[13px] font-semibold text-fg mb-0.5">{label}</p>
      <p className="text-[12px] text-fg-subtle mb-2">{sublabel}</p>

      {slot.file && slot.preview ? (
        <div className="relative rounded-xl overflow-hidden border border-line bg-surface-2 aspect-square">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={slot.preview} alt={label} className="w-full h-full object-cover" />
          {!disabled && (
            <button
              aria-label={`Remove ${label.toLowerCase()}`}
              type="button"
              onClick={onClear}
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 hover:bg-black/85 text-white flex items-center justify-center transition-colors"
            >
              <IcX />
            </button>
          )}
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(",")}
            className="hidden"
            disabled={disabled}
            onChange={(e) => { pick(e.target.files); e.target.value = ""; }}
          />
          <button
            type="button"
            disabled={disabled}
            aria-label={`Upload ${label.toLowerCase()}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files); }}
            className={`w-full aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
              dragging ? "border-primary bg-primary/10" : "border-line-strong bg-surface-1 hover:bg-surface-3"
            }`}
          >
            <span className="text-primary"><IcUpload /></span>
            <span className="text-[12px] font-medium text-fg">Click or drag to upload</span>
            <span className="text-[11px] text-fg-subtle">PNG, JPG, WEBP · up to {formattedMaxSize ?? "10 MB"}</span>
          </button>
        </>
      )}
    </div>
  );
}

export default function FaceSwapTool() {
  const { user, token, openAuthModal, refreshUser } = useAuth();
  const job = useJobPolling({ toolSlug: "face-swap", token });
  const fireReviewPrompt = useReviewPromptTrigger();
  const hasAccess = useToolAccess("pro");
  const submittingRef = useRef(false);
  const downloadedForJobId = useRef<string | null>(null);

  const [charSlot, setCharSlot] = useState<ImageSlot>({ file: null, preview: null });
  const [targSlot, setTargSlot] = useState<ImageSlot>({ file: null, preview: null });
  // The server refuses a swap without this (app/api/tools/face-swap/route.ts).
  const [consent, setConsent] = useState(false);
  const [pickError, setPickError] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  function pickFile(which: "char" | "targ", file: File) {
    setPickError("");
    const preview = URL.createObjectURL(file);
    if (which === "char") {
      if (charSlot.preview) URL.revokeObjectURL(charSlot.preview);
      setCharSlot({ file, preview });
    } else {
      if (targSlot.preview) URL.revokeObjectURL(targSlot.preview);
      setTargSlot({ file, preview });
    }
  }

  function clearFile(which: "char" | "targ") {
    if (which === "char") {
      if (charSlot.preview) URL.revokeObjectURL(charSlot.preview);
      setCharSlot({ file: null, preview: null });
    } else {
      if (targSlot.preview) URL.revokeObjectURL(targSlot.preview);
      setTargSlot({ file: null, preview: null });
    }
  }

  function reset() {
    clearFile("char");
    clearFile("targ");
    setConsent(false);
    job.reset();
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
  }

  const handleGenerate = useCallback(async () => {
    if (!charSlot.file || !targSlot.file || !consent) return;
    if (!user || !token) { openAuthModal("login", "AI Face Swap"); return; }
    if (submittingRef.current) return;
    submittingRef.current = true;

    if (resultUrl) { URL.revokeObjectURL(resultUrl); setResultUrl(null); }

    const idempotencyKey = crypto.randomUUID();
    try {
      await job.start(async () => {
        const form = new FormData();
        form.append("characterImage", charSlot.file!);
        form.append("targetImage", targSlot.file!);
        form.append("consent", "1");
        form.append("idempotencyKey", idempotencyKey);

        const res = await fetch("/api/tools/face-swap", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(d.error ?? `Error ${res.status}`);
        }
        return (await res.json()) as { jobId: string };
      });
    } finally {
      submittingRef.current = false;
    }
  }, [charSlot.file, targSlot.file, consent, user, token, openAuthModal, resultUrl, job]);

  // Once the job is done, fetch the result image.
  useEffect(() => {
    if (job.status !== "done" || !job.jobId || !token) return;
    if (downloadedForJobId.current === job.jobId) return;
    downloadedForJobId.current = job.jobId;
    fireReviewPrompt("tool_generation_complete", { featureHint: "ai_tools" }).catch(() => { /* non-critical */ });

    (async () => {
      try {
        const dlRes = await fetch(`/api/tools/face-swap?jobId=${job.jobId}&download=1`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!dlRes.ok) throw new Error("Failed to retrieve result");
        const blob = await dlRes.blob();
        setResultUrl(URL.createObjectURL(blob));
        await refreshUser();
      } catch {
        // The job itself succeeded; leave the user on the done screen without
        // a preview rather than flipping to an error state.
      }
    })();
  }, [job.status, job.jobId, token, refreshUser, fireReviewPrompt]);

  // Revoke the held result object URL on unmount.
  useEffect(() => {
    return () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDownload() {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = "face-swap-result.jpg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const busy = job.status === "processing";
  const canGenerate = !!charSlot.file && !!targSlot.file && consent && !busy;

  return (
    <ToolWorkspace
      title="AI Face Swap"
      icon="face"
      badges={<><ToolBadge tone="pro">Pro</ToolBadge><ToolBadge>{CREDIT_COST} credits</ToolBadge></>}
      description="Put the face from one photo onto the person in another."
      controls={
        !hasAccess ? (
          <ToolPlanGate toolName="Face Swap" minTier="pro" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <ImageDropZone
                label="Face to use"
                sublabel="A clear, front-facing photo"
                slot={charSlot}
                disabled={busy}
                onPick={(f) => pickFile("char", f)}
                onClear={() => clearFile("char")}
                onReject={setPickError}
              />
              <ImageDropZone
                label="Photo to change"
                sublabel="Whose face is replaced"
                slot={targSlot}
                disabled={busy}
                onPick={(f) => pickFile("targ", f)}
                onClear={() => clearFile("targ")}
                onReject={setPickError}
              />
            </div>
            {pickError && <p role="alert" className="text-sm text-error">{pickError}</p>}

            {/* Consent — required by the server on every swap. */}
            <label className="flex items-start gap-3 rounded-xl border border-line bg-surface-1 px-4 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                disabled={busy}
                className="mt-0.5 w-4 h-4 flex-shrink-0 accent-[var(--primary)] cursor-pointer"
              />
              <span className="text-[13px] text-fg-muted leading-relaxed">
                I own these photos or have the permission of everyone shown, and I won&apos;t use the result to deceive, harass or impersonate anyone.
              </span>
            </label>
          </>
        )
      }
      footer={
        hasAccess && (
          <>
            {job.status === "error" && job.error && <p role="alert" className="text-sm text-error">{job.error}</p>}
            {job.status === "cancelled" && <p className="text-sm text-fg-muted">Cancelled — your credits were refunded.</p>}
            <CostRow right={user ? `You have ${user.credits.toLocaleString()}` : undefined}>
              Costs <span className="font-semibold text-fg">{CREDIT_COST} credits</span> · refunded if it fails
            </CostRow>
            <Button type="button" onClick={() => void handleGenerate()} disabled={!canGenerate} loading={busy} className="w-full">
              {busy ? "Processing…" : "Swap faces"}
            </Button>
            {!user && <p className="text-xs text-fg-subtle text-center">You&apos;ll be asked to sign in to generate.</p>}
          </>
        )
      }
      stageActions={
        job.status === "done" && resultUrl ? (
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={handleDownload}><span className="inline-flex items-center gap-2"><IcDownload /> Download</span></Button>
            <Button type="button" size="sm" variant="secondary" onClick={reset}>Swap another</Button>
          </div>
        ) : undefined
      }
      stage={
        busy ? (
          <StageProgress label="Swapping faces…" progress={job.progress} onCancel={() => void job.cancel()} />
        ) : job.status === "done" && resultUrl ? (
          <div className="flex flex-1 flex-col gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resultUrl} alt="Face swap result" className="w-full flex-1 rounded-xl border border-line bg-surface-1 object-contain max-h-[640px]" />
            <p className="text-[12px] text-fg-subtle">Saved to your Assets</p>
          </div>
        ) : targSlot.preview ? (
          <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={targSlot.preview} alt="Photo to change" className="max-h-[640px] w-full object-contain opacity-80" />
            <span className="absolute left-3 top-3 rounded-md bg-black/70 px-2 py-1 text-[11px] text-white">Photo to change · the result appears here</span>
          </div>
        ) : (
          <StageEmpty icon="face" title="Your swapped photo appears here">
            Add the face to use and the photo to change on the left.
          </StageEmpty>
        )
      }
      below={user ? <RecentResults source="face-swap" label="Recent swaps" refreshKey={resultUrl} /> : undefined}
    />
  );
}
