"use client";

// Caption Studio, step 1: bring a video (upload here, or pick from Assets),
// pick the frame it exports in, and say how to transcribe it. "Pick a template
// & edit" creates the project and opens step 2, where transcription runs.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/AuthContext";
import { AssetPicker } from "@/app/components/assets/AssetPicker";
import type { PickerAsset } from "@/app/components/assets/assetPickerData";
import { useUploadQueue } from "@/app/dashboard/assets/hooks/useUploadQueue";
import { probeVideoSize } from "@/app/dashboard/editor/components/panels/shared/assetData";
import { Switch } from "@/app/components/ui/Switch";
import { clientAuthToken } from "@/lib/client-session";
import { ACCEPTED_VIDEO_TYPES } from "@/lib/autoclip-source";
import { DUB_LANGUAGES } from "@/lib/languages";
import { ASPECT_DIMENSIONS, originalFrame, type Aspect } from "@/lib/editor/types";
import { STUDIO_ASPECTS } from "@/lib/captions/studio";
import { StudioHeader } from "./_components/StudioHeader";

type Source =
  | { kind: "upload"; itemId: string; localUrl: string; name: string }
  | { kind: "asset"; asset: PickerAsset };

/** A small outline of the frame shape, for the format cards. */
function ShapeIcon({ aspect }: { aspect: Aspect }) {
  const box = aspect === "original" ? null : ASPECT_DIMENSIONS[aspect];
  if (!box) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" className="h-9 w-9" aria-hidden="true">
        <path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6" />
      </svg>
    );
  }
  const s = 34 / Math.max(box.w, box.h);
  return <span className="block rounded-[4px] border-2 border-current" style={{ width: Math.round(box.w * s), height: Math.round(box.h * s) }} aria-hidden="true" />;
}

export default function CaptionStudioUploadPage() {
  const router = useRouter();
  const { user } = useAuth();
  const queue = useUploadQueue();
  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [aspect, setAspect] = useState<Aspect>("original");
  const [language, setLanguage] = useState("");
  const [removeFillers, setRemoveFillers] = useState(true);
  // The video's own size and length, read from the file and tied to the URL
  // they were read from, so a newly picked video never shows the last one's.
  const [meta, setMeta] = useState<{ url: string; size: { w: number; h: number }; duration: number | null } | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What the source is now: its preview URL, upload state, and asset once ready.
  const view = useMemo(() => {
    if (!source) return null;
    if (source.kind === "asset") {
      return { name: source.asset.name, previewUrl: source.asset.url, state: "ready" as const, progress: 100, assetId: source.asset.id, error: null };
    }
    const item = queue.items.find((i) => i.id === source.itemId);
    const base = { name: source.name, previewUrl: source.localUrl, assetId: null as string | null, error: null as string | null };
    if (!item || item.status === "uploading" || item.status === "paused") return { ...base, state: "uploading" as const, progress: item?.progress ?? 0 };
    if (item.status === "processing") return { ...base, state: "processing" as const, progress: 100 };
    if (item.status === "done" || item.status === "duplicate") return { ...base, state: "ready" as const, progress: 100, assetId: item.asset?.id ?? null };
    return { ...base, state: "error" as const, progress: item.progress, error: item.error ?? "The upload stopped. Try again." };
  }, [source, queue.items]);

  // Read the video's own size and length from the file itself: the format
  // preview needs the shape, and an asset row may not have either yet.
  const previewUrl = view?.previewUrl ?? null;
  useEffect(() => {
    if (!previewUrl) return;
    let live = true;
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      if (!live) return;
      setMeta({ url: previewUrl, size: { w: el.videoWidth, h: el.videoHeight }, duration: Number.isFinite(el.duration) ? el.duration : null });
    };
    el.src = previewUrl;
    return () => { live = false; };
  }, [previewUrl]);
  const videoSize = meta && meta.url === previewUrl ? meta.size : null;
  const duration = meta && meta.url === previewUrl ? meta.duration : null;

  const chooseFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("video/")) { setError("Pick a video file (MP4, MOV or WEBM)."); return; }
    if (source?.kind === "upload") URL.revokeObjectURL(source.localUrl);
    const [itemId] = await queue.addFiles([file]);
    setSource({ kind: "upload", itemId, localUrl: URL.createObjectURL(file), name: file.name });
  }, [queue, source]);

  const chooseAsset = (asset: PickerAsset) => {
    setPickerOpen(false);
    setError(null);
    if (asset.kind !== "video") { setError("Pick a video. Captions are made from speech in a video."); return; }
    if (source?.kind === "upload") URL.revokeObjectURL(source.localUrl);
    setSource({ kind: "asset", asset });
  };

  const frame = aspect === "original" ? (videoSize ? originalFrame(videoSize.w, videoSize.h) : null) : ASPECT_DIMENSIONS[aspect];
  const previewBox = frame ? Math.min(560 / frame.h, 520 / frame.w) : 0;
  const minutes = duration ? Math.max(1, Math.ceil(duration / 60)) : null;

  const start = async () => {
    if (!view || view.state !== "ready" || !view.assetId || starting) return;
    setStarting(true);
    setError(null);
    try {
      // Read again if the preview hadn't finished loading.
      const size = videoSize ?? (view.previewUrl ? await probeVideoSize(view.previewUrl).catch(() => null) : null);
      const token = clientAuthToken();
      const res = await fetch("/api/captions/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          assetId: view.assetId,
          aspect,
          ...(size && size.w && size.h ? { videoSize: size } : {}),
          ...(duration ? { durationSec: duration } : {}),
          ...(language ? { language } : {}),
          removeFillers,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't start from this video.");
      router.push(`/dashboard/captions/${body.projectId}?step=edit`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start from this video.");
      setStarting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <StudioHeader current="upload" title="New caption project" />
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)_380px]">
        {/* Source */}
        <section aria-labelledby="cs-source" className="flex flex-col gap-5 border-line bg-surface-1 p-6 lg:border-r">
          <div className="flex flex-col gap-1.5">
            <h1 id="cs-source" className="text-2xl font-extrabold tracking-[-0.02em]">Add your video</h1>
            <p className="text-sm text-fg-muted">Any size works — vertical, horizontal, square or odd crops.</p>
          </div>
          <input ref={fileRef} type="file" accept={ACCEPTED_VIDEO_TYPES.join(",")} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { void chooseFile(e.target.files?.[0]); e.target.value = ""; }} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); void chooseFile(e.dataTransfer.files?.[0]); }}
            className="flex h-[150px] flex-col items-center justify-center gap-2.5 rounded-[18px] border-[1.5px] border-dashed border-emerald-bright/45 bg-emerald-brand/5 text-center outline-none hover:bg-emerald-brand/10 focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-emerald-bright" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>
            <span className="text-[15px] font-semibold">Drop a file or <span className="text-emerald-bright">browse</span></span>
            <span className="text-xs text-fg-subtle">MP4, MOV or WEBM</span>
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="h-11 rounded-xl border border-line-strong text-sm font-semibold text-fg hover:bg-surface-3 outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            Choose from Assets
          </button>

          {view && (
            <div className="flex items-center gap-3 rounded-[14px] border border-emerald-bright/35 bg-surface-3 p-3">
              <video src={view.previewUrl} muted playsInline preload="metadata" className="h-16 w-10 flex-shrink-0 rounded-lg bg-bg object-cover" aria-hidden="true" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="truncate text-sm font-semibold" title={view.name}>{view.name}</p>
                <p className="font-mono text-xs text-fg-muted" role="status" aria-live="polite">
                  {videoSize ? `${videoSize.w}×${videoSize.h}` : "…"}
                  {duration ? ` · ${Math.floor(duration / 60)}:${String(Math.round(duration % 60)).padStart(2, "0")}` : ""}
                  {view.state === "uploading" ? ` · uploading ${view.progress}%` : view.state === "processing" ? " · processing" : ""}
                </p>
                {view.state !== "ready" && view.state !== "error" && (
                  <div className="h-1 rounded-full bg-line"><div className="h-1 rounded-full bg-emerald-bright" style={{ width: `${view.progress}%` }} /></div>
                )}
                {view.state === "error" && (
                  <p className="text-xs text-error">
                    {view.error}{" "}
                    {source?.kind === "upload" && <button type="button" className="underline" onClick={() => queue.retry(source.itemId)}>Retry</button>}
                  </p>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Preview */}
        <section aria-label="Preview" className="flex min-h-[420px] flex-col items-center justify-center gap-4 p-6">
          {view && frame ? (
            <>
              <span className="rounded-lg border border-line bg-surface-3 px-2.5 py-1 font-mono text-xs text-fg-muted">
                {aspect === "original" ? "Original" : aspect} · {frame.w}×{frame.h}
              </span>
              <div
                className="overflow-hidden rounded-[20px] border border-line-strong bg-black"
                style={{ width: Math.round(frame.w * previewBox), height: Math.round(frame.h * previewBox) }}
              >
                <video src={view.previewUrl} muted loop autoPlay playsInline className="h-full w-full object-cover" aria-label={`Preview of ${view.name} in this frame`} />
              </div>
              <p className="max-w-sm text-center text-xs text-fg-subtle">Fills the frame and crops the overflow. You can switch to fit-with-blur or move the crop later.</p>
            </>
          ) : (
            <p className="max-w-xs text-center text-sm text-fg-subtle">Your video shows here, in the shape you pick.</p>
          )}
        </section>

        {/* Settings */}
        <aside aria-label="Settings" className="flex flex-col gap-6 border-line bg-surface-1 p-6 lg:border-l">
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-3 text-base font-bold">Output format</legend>
            <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Output format">
              {STUDIO_ASPECTS.map((a) => {
                const on = aspect === a.value;
                const disabled = a.value === "original" && !!view && !videoSize;
                return (
                  <button
                    key={a.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={disabled}
                    onClick={() => setAspect(a.value)}
                    title={a.hint}
                    className={`flex flex-col items-center gap-2 rounded-[14px] px-2 pb-3 pt-3.5 outline-none focus-visible:ring-2 focus-visible:ring-primary/70 disabled:opacity-40 ${
                      on ? "border-[1.5px] border-primary bg-primary/10 text-primary" : "border border-line-strong text-fg-muted hover:text-fg"
                    }`}
                  >
                    <span className="flex h-9 items-center"><ShapeIcon aspect={a.value} /></span>
                    <span className={`text-[13px] ${on ? "font-bold" : "font-semibold"}`}>{a.label}</span>
                    <span className="font-mono text-[11px] text-fg-subtle">{a.value === "original" ? "own size" : a.value}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[13px] text-fg-subtle">You can export more shapes at the end — captions re-flow for each.</p>
          </fieldset>

          <label className="flex flex-col gap-2 text-sm font-semibold">
            Spoken language
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="h-11 rounded-xl border border-line-strong bg-surface-3 px-3 text-sm font-normal text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              <option value="">Auto-detect</option>
              <option value="en">English</option>
              {DUB_LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </label>

          <div className="flex items-center justify-between gap-3 rounded-[14px] border border-line bg-surface-2 p-4 text-sm">
            <span>Remove filler words (um, uh)</span>
            <Switch checked={removeFillers} onChange={setRemoveFillers} label="Remove filler words" />
          </div>

          <div className="mt-auto flex flex-col gap-2.5">
            {error && <p role="alert" className="text-sm text-error">{error}</p>}
            <button
              type="button"
              onClick={() => void start()}
              disabled={!view || view.state !== "ready" || !view.assetId || starting || (aspect === "original" && !videoSize)}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-bold text-on-primary outline-none hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-primary/70 disabled:opacity-40"
            >
              {starting ? "Starting…" : "Pick a template & edit"}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className="h-4 w-4" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
            <p className="text-center text-xs text-fg-subtle">
              {minutes ? `Captioning uses ${minutes} Clip Minute${minutes === 1 ? "" : "s"}` : "Captioning uses 1 Clip Minute per minute of video"}
              {user ? ` · you have ${user.minutes ?? 0}` : ""}
            </p>
          </div>
        </aside>
      </div>
      <AssetPicker open={pickerOpen} onClose={() => setPickerOpen(false)} accept={["video"]} onSelect={chooseAsset} title="Choose a video" />
    </div>
  );
}
