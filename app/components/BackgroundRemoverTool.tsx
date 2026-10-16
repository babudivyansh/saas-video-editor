"use client";
import { useCallback, useRef, useState, useEffect } from "react";
import { useAuth } from "@/app/components/AuthContext";
import { useJobPolling } from "./useJobPolling";
import { useReviewPromptTrigger } from "@/app/components/reviews/ReviewPromptProvider";
import { useUploadEntitlement } from "@/app/hooks/useUploadEntitlement";
import { Button } from "@/app/components/ui/Button";
import { ToolWorkspace, ToolBadge, ToolField, CostRow, FileDrop, Segmented, StageEmpty, StageProgress, RecentResults } from "@/app/components/tools/ToolWorkspace";

function IcDownload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}


// Checkerboard pattern to show transparency
function CheckerBg({ children, fill }: { children: React.ReactNode; fill?: string | null }) {
  return (
    <div
      className="rounded-xl overflow-hidden border border-line"
      style={fill ? { background: fill } : {
        backgroundImage:
          "linear-gradient(45deg,rgba(255,255,255,0.10) 25%,transparent 25%)," +
          "linear-gradient(-45deg,rgba(255,255,255,0.10) 25%,transparent 25%)," +
          "linear-gradient(45deg,transparent 75%,rgba(255,255,255,0.10) 75%)," +
          "linear-gradient(-45deg,transparent 75%,rgba(255,255,255,0.10) 75%)",
        backgroundSize: "16px 16px",
        backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
        backgroundColor: "var(--surface-3)",
      }}
    >
      {children}
    </div>
  );
}

// Must match CREDIT_COST in app/api/tools/background-remover/route.ts.
const CREDIT_COST = 1;

// What the downloaded PNG sits on. The saved asset is always transparent; a
// solid colour is painted under the cut-out in the browser at download time.
const BACKGROUNDS = [
  ["transparent", "Transparent", null],
  ["white", "White", "#ffffff"],
  ["black", "Black", "#000000"],
  ["lime", "Lime", "#c8ff55"],
] as const;
type Background = (typeof BACKGROUNDS)[number][0];

export default function BackgroundRemoverTool() {
  const { user, token, openAuthModal, refreshUser } = useAuth();
  const job = useJobPolling({ toolSlug: "background-remover", token });
  const fireReviewPrompt = useReviewPromptTrigger();
  const submittingRef = useRef(false);
  const downloadedForJobId = useRef<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [background, setBackground] = useState<Background>("transparent");
  const [compareView, setCompareView] = useState<"before" | "after">("after");
  const [pickError, setPickError] = useState<string | null>(null);
  const { maxBytes: uploadMaxBytes, formattedMaxSize: uploadMaxSizeLabel } = useUploadEntitlement("background-remover");
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPick(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    const f = files[0];
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
    if (!allowed.includes(f.type)) {
      setPickError("Only PNG, JPG, WEBP, GIF images are supported.");
      return;
    }
    if (uploadMaxBytes != null && f.size > uploadMaxBytes) {
      setPickError(`File too large (max ${uploadMaxSizeLabel}).`);
      return;
    }
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(f));
    setCompareView("after");
    job.reset();
    setPickError(null);
    if (resultUrl) { URL.revokeObjectURL(resultUrl); setResultUrl(null); }
  }

  function clearFile() {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    job.reset();
    setPickError(null);
    if (resultUrl) { URL.revokeObjectURL(resultUrl); setResultUrl(null); }
  }

  const handleRemove = useCallback(async () => {
    if (!file || job.status === "processing") return;
    if (!user || !token) { openAuthModal("login", "AI Background Remover"); return; }
    if (submittingRef.current) return;
    submittingRef.current = true;

    if (resultUrl) { URL.revokeObjectURL(resultUrl); setResultUrl(null); }

    const idempotencyKey = crypto.randomUUID();
    try {
      await job.start(async () => {
        const form = new FormData();
        form.append("file", file);
        form.append("idempotencyKey", idempotencyKey);
        const res = await fetch("/api/tools/background-remover", {
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
  }, [file, user, token, openAuthModal, resultUrl, job]);

  // Once the job is done, fetch the result image.
  useEffect(() => {
    if (job.status !== "done" || !job.jobId || !token) return;
    if (downloadedForJobId.current === job.jobId) return;
    downloadedForJobId.current = job.jobId;
    fireReviewPrompt("tool_generation_complete", { featureHint: "ai_tools" }).catch(() => { /* non-critical */ });

    (async () => {
      try {
        const dlRes = await fetch(`/api/tools/background-remover?jobId=${job.jobId}&download=1`, {
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

  async function handleDownload() {
    if (!resultUrl || !file) return;
    const base = file.name.replace(/\.[^.]+$/, "");
    const fill = BACKGROUNDS.find(([v]) => v === background)?.[2] ?? null;
    let href = resultUrl;
    if (fill) {
      // Paint the chosen colour under the cut-out.
      const img = new Image();
      img.src = resultUrl;
      await img.decode().catch(() => undefined);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (ctx && canvas.width > 0) {
        ctx.fillStyle = fill;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        href = canvas.toDataURL("image/png");
      }
    }
    const a = document.createElement("a");
    a.href = href;
    a.download = `${base}-no-bg.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const stage = file ? (job.status === "idle" ? "ready" : job.status) : "idle";
  const busy = stage === "processing";
  const done = stage === "done" && !!resultUrl;
  const bgFill = BACKGROUNDS.find(([v]) => v === background)?.[2] ?? null;

  return (
    <ToolWorkspace
      title="Background Remover"
      icon="image"
      badges={<ToolBadge>{CREDIT_COST} credit</ToolBadge>}
      description="Cut out the subject and get a transparent PNG."
      controls={
        <>
          <ToolField label="Image">
            <FileDrop
              accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
              title="Click or drag an image here"
              hint={<>PNG, JPG, WEBP, GIF · up to {uploadMaxSizeLabel ?? "10 MB"} · GIFs use the first frame</>}
              file={file}
              onFile={(f) => onPick([f])}
              onClear={busy ? undefined : clearFile}
              disabled={busy}
              inputLabel="Upload an image"
            />
            {pickError && <p role="alert" className="text-[12.5px] text-error">{pickError}</p>}
          </ToolField>
          <ToolField label="Background" hint="for the download">
            <div role="radiogroup" aria-label="Background" className="flex flex-wrap gap-2">
              {BACKGROUNDS.map(([v, label, fill]) => (
                <label key={v} className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${background === v ? "border-primary/60 bg-primary/10 text-fg" : "border-line text-fg-muted hover:text-fg"}`}>
                  <input type="radio" name="bg" value={v} checked={background === v} onChange={() => setBackground(v)} className="sr-only" />
                  <span aria-hidden="true" className="h-3.5 w-3.5 rounded-full border border-line-strong" style={fill ? { background: fill } : { background: "repeating-conic-gradient(var(--fg-subtle) 0 25%, var(--surface-3) 0 50%) 50% / 6px 6px" }} />
                  {label}
                </label>
              ))}
            </div>
          </ToolField>
        </>
      }
      footer={
        <>
          {stage === "error" && job.error && <p role="alert" className="text-sm text-error">{job.error}</p>}
          {stage === "cancelled" && <p className="text-sm text-fg-muted">Cancelled — your credit was refunded.</p>}
          <CostRow right={user ? `You have ${user.credits.toLocaleString()}` : undefined}>
            Costs <span className="font-semibold text-fg">{CREDIT_COST} credit</span> · refunded if it fails
          </CostRow>
          <Button type="button" className="w-full" onClick={() => void handleRemove()} disabled={!file || busy} loading={busy}>
            {busy ? "Processing…" : done ? "Run again" : "Remove background"}
          </Button>
          {!user && <p className="text-center text-xs text-fg-subtle">You&apos;ll be asked to sign in to process.</p>}
        </>
      }
      stageActions={
        done ? (
          <div className="flex flex-wrap items-center gap-2">
            <Segmented label="Compare" value={compareView} onChange={setCompareView} options={[["before", "Before"], ["after", "After"]] as const} />
            <Button type="button" size="sm" onClick={() => void handleDownload()}><span className="inline-flex items-center gap-2"><IcDownload /> Download PNG</span></Button>
          </div>
        ) : undefined
      }
      stage={
        busy ? (
          <StageProgress label="Removing the background…" progress={job.progress} onCancel={() => void job.cancel()} cancelLabel="Cancel" />
        ) : done && compareView === "after" ? (
          <div className="flex flex-1 flex-col gap-2">
            <CheckerBg fill={bgFill}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resultUrl!} alt="Background removed" className="mx-auto max-h-[620px] w-full object-contain" />
            </CheckerBg>
            <p className="text-[12px] text-fg-subtle">Saved to your Assets as a transparent PNG</p>
          </div>
        ) : preview ? (
          <div className="flex flex-1 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Original" className="max-h-[620px] w-full object-contain" />
          </div>
        ) : (
          <StageEmpty icon="image" title="Your cut-out appears here">
            Add an image on the left. The result has a transparent background you can place on anything.
          </StageEmpty>
        )
      }
      below={user ? <RecentResults source="background-remover" label="Recent cut-outs" refreshKey={resultUrl} /> : undefined}
    />
  );
}
