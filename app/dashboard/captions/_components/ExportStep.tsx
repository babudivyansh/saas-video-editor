"use client";

// Caption Studio, step 5: render the captioned video in every shape at once
// (POST /api/captions/export — one render credit for the whole batch), follow
// each render, download them; or take the captions alone as SRT / VTT.

import { useCallback, useEffect, useState } from "react";
import { useInsufficientCredits } from "@/app/components/billing/CreditModalContext";
import { probeVideoSize } from "@/app/dashboard/editor/components/panels/shared/assetData";
import { clientAuthToken } from "@/lib/client-session";
import { captionsToSrt } from "@/lib/editor/srt";
import { docDimensions, originalFrame, type Aspect } from "@/lib/editor/types";
import { STUDIO_ASPECTS, currentTemplateId } from "@/lib/captions/studio";
import { CAPTION_EXPORT_ASPECTS, type CaptionExportAspect } from "@/lib/editor/caption-export-shapes";
import { useCaptionTemplates } from "@/app/components/captions/useCaptionTemplates";
import { StudioPreview } from "./StudioPreview";
import type { StudioProject } from "./useStudioProject";

interface RenderRow {
  id: string;
  aspect: string;
  status: "queued" | "rendering" | "completed" | "failed";
  progress: number;
  failureReason: string | null;
  url: string | null;
}

const authHeaders = (): Record<string, string> => {
  const token = clientAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const LABEL = Object.fromEntries(STUDIO_ASPECTS.map((a) => [a.value, a])) as Record<Aspect, (typeof STUDIO_ASPECTS)[number]>;
const active = (rows: RenderRow[]) => rows.some((r) => r.status === "queued" || r.status === "rendering");

/** SRT → WebVTT: a header, and "." before the milliseconds. */
export function srtToVtt(srt: string): string {
  return `WEBVTT\n\n${srt.replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, "$1.$2")}`;
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportStep({ project }: { project: StudioProject }) {
  const { doc } = project;
  const credits = useInsufficientCredits();
  const { templates } = useCaptionTemplates();
  const own: CaptionExportAspect = doc.aspect;
  const [picked, setPicked] = useState<Set<CaptionExportAspect>>(() => new Set([own]));
  const [rows, setRows] = useState<RenderRow[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "Original" needs the video's own size: the project's, or read from the
  // file (the server checks it again against the stored one).
  const video = doc.tracks.video[0];
  const mediaUrl = video ? project.media[video.assetId]?.url ?? null : null;
  const [probed, setProbed] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (doc.aspect === "original" || !mediaUrl) return;
    let live = true;
    probeVideoSize(mediaUrl).then((s) => { if (live && s.w && s.h) setProbed(s); }).catch(() => {});
    return () => { live = false; };
  }, [doc.aspect, mediaUrl]);
  const originalSize = doc.aspect === "original" ? doc.size ?? null : probed ? originalFrame(probed.w, probed.h) : null;
  const shapes = CAPTION_EXPORT_ASPECTS.filter((a) => a !== "original" || originalSize);
  const framed = (a: CaptionExportAspect) => (a === "original" ? { ...doc, aspect: a, size: originalSize! } : { ...doc, aspect: a });

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/captions/export?projectId=${project.projectId}`, { headers: authHeaders() }).catch(() => null);
    if (!res?.ok) return;
    const body = await res.json();
    setRows(body.renders ?? []);
  }, [project.projectId]);

  // The latest batch on open, then every 2s while one is still running.
  // Restarts when a batch starts or finishes, not on every progress tick.
  const running = active(rows);
  useEffect(() => {
    let live = true;
    let timer: number | undefined;
    const tick = async () => {
      await refresh();
      if (live && running) timer = window.setTimeout(tick, 2000);
    };
    void tick();
    return () => { live = false; if (timer) window.clearTimeout(timer); };
  }, [refresh, running]);

  const toggle = (a: CaptionExportAspect) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(a)) n.delete(a);
      else n.add(a);
      return n;
    });

  const render = async () => {
    setStarting(true);
    setError(null);
    const res = await fetch("/api/captions/export", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ projectId: project.projectId, aspects: shapes.filter((a) => picked.has(a)) }),
    }).catch(() => null);
    setStarting(false);
    if (!res) { setError("Couldn't reach the server. Check your connection."); return; }
    if (await credits.handle402(res, { action: "this export" })) return;
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.message ?? body.error ?? "Couldn't start the export."); return; }
    setRows((body.renders as { id: string; aspect: string }[]).map((r) => ({ ...r, status: "queued", progress: 0, failureReason: null, url: null })));
  };

  const count = picked.size;
  const seconds = Math.round(doc.tracks.video[0]?.duration ?? 0);
  const templateId = currentTemplateId(doc);
  const templateName = templates.find((t) => t.id === templateId)?.name ?? templateId ?? "—";
  const base = project.title.replace(/[^\w\- ]+/g, "").trim() || "captions";

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px]">
      <main className="flex min-w-0 flex-col gap-6 p-6 lg:p-9">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-extrabold tracking-[-0.02em]">Export your captioned video</h1>
          <p className="text-sm text-fg-muted">Pick every shape you need. Captions re-fit each one — check the previews.</p>
        </div>

        <fieldset>
          <legend className="mb-3.5 text-[15px] font-bold">Shapes</legend>
          <div className="flex flex-wrap items-end gap-4">
            {shapes.map((a) => {
              const on = picked.has(a);
              const f = docDimensions(framed(a));
              return (
                <label key={a} className={`flex cursor-pointer flex-col gap-2.5 rounded-[18px] p-3 ${on ? "border-[1.5px] border-primary bg-surface-2" : "border border-line-strong bg-surface-1"}`}>
                  <span className="flex items-center justify-between gap-3 text-sm font-bold">
                    <span>{a === "original" ? "Original" : a}{a === own ? <span className="ml-1.5 font-normal text-fg-subtle">· this project</span> : null}</span>
                    <input type="checkbox" checked={on} disabled={running} onChange={() => toggle(a)} className="h-5 w-5 accent-[var(--primary)]" />
                  </span>
                  <span className={on ? "" : "opacity-50"}>
                    <StudioPreview doc={framed(a)} media={project.media} maxWidth={200} maxHeight={200} autoPlay={false} />
                  </span>
                  <span className="text-xs text-fg-subtle">{LABEL[a]?.hint} · {f.w}×{f.h}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3 rounded-[18px] border border-line bg-surface-1 p-5">
          <legend className="px-1.5 text-[15px] font-bold">Captions only</legend>
          <p className="text-[13px] text-fg-muted">The text and timing, for a platform&apos;s own caption upload. Free — no render needed.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => download(`${base}.srt`, captionsToSrt(doc.tracks.caption), "application/x-subrip")} className="h-10 rounded-xl border border-line-strong px-4 text-sm font-semibold hover:bg-surface-3">Download SRT</button>
            <button type="button" onClick={() => download(`${base}.vtt`, srtToVtt(captionsToSrt(doc.tracks.caption)), "text/vtt")} className="h-10 rounded-xl border border-line-strong px-4 text-sm font-semibold hover:bg-surface-3">Download VTT</button>
          </div>
        </fieldset>
      </main>

      <aside aria-label="Summary" className="flex flex-col gap-5 border-line bg-surface-1 p-6 lg:border-l">
        <div className="flex flex-col gap-4 rounded-3xl border border-line bg-surface-2 p-5">
          <h2 className="text-lg font-extrabold">Summary</h2>
          <dl className="flex flex-col gap-2.5 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-fg-muted">Videos</dt><dd className="text-right font-semibold">{count} · {shapes.filter((a) => picked.has(a)).map((a) => (a === "original" ? "Original" : a)).join(", ") || "none"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-fg-muted">Template</dt><dd className="font-semibold">{templateName}{doc.captionStyle && Object.keys(doc.captionStyle).length ? " (styled)" : ""}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-fg-muted">Length</dt><dd className="font-mono font-semibold">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</dd></div>
          </dl>
          <div className="h-px bg-line" />
          <div className="flex items-baseline justify-between"><span className="text-sm text-fg-muted">Uses</span><span className="text-[28px] font-extrabold tracking-[-0.02em]">1 credit</span></div>
          <p className="text-xs leading-relaxed text-fg-subtle">One render credit for every shape in this export. Refunded if nothing renders.</p>
          {error && <p role="alert" className="text-sm text-error">{error}</p>}
          <button
            type="button"
            onClick={() => void render()}
            disabled={count === 0 || running || starting}
            className="flex h-[50px] items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-extrabold text-on-primary hover:bg-primary-hover disabled:opacity-40"
          >
            {starting ? "Starting…" : running ? "Rendering…" : `Render ${count} ${count === 1 ? "video" : "videos"}`}
          </button>
        </div>

        {rows.length > 0 && (
          <section aria-labelledby="cs-renders" className="flex flex-col gap-2.5">
            <h3 id="cs-renders" className="font-mono text-xs uppercase tracking-[0.08em] text-fg-subtle">{running ? "Rendering" : "Last export"}</h3>
            {rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-[14px] bg-surface-3 p-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="text-sm font-semibold">{r.aspect === "original" ? "Original" : r.aspect}</span>
                  {r.status === "completed" ? (
                    <span className="text-xs text-success">Ready</span>
                  ) : r.status === "failed" ? (
                    <span className="text-xs text-error">{r.failureReason ?? "Didn't render."}</span>
                  ) : (
                    <div className="h-1 rounded-full bg-line" role="progressbar" aria-label={`${r.aspect} progress`} aria-valuenow={r.progress} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-1 rounded-full bg-emerald-bright transition-[width]" style={{ width: `${Math.max(3, r.progress)}%` }} />
                    </div>
                  )}
                </div>
                {r.status === "completed" && r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold text-emerald-bright hover:underline">Download</a>
                ) : r.status !== "failed" && r.status !== "completed" ? (
                  <span className="font-mono text-xs text-fg-muted">{r.status === "queued" ? "Queued" : `${r.progress}%`}</span>
                ) : null}
              </div>
            ))}
          </section>
        )}
      </aside>
    </div>
  );
}
