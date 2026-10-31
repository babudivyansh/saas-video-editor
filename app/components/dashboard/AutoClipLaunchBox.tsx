"use client";

// Home's hero: one box that starts AutoClip, the way the dashboard's job is
// framed — bring the long video, get clips. Three ways in:
//   • paste a link: goes to the AutoClip page, which probes it
//     (UrlImportField `initialUrl`), with the presets as query params;
//   • Upload: the file uploads right here, OpusClip-style, into the Assets
//     library (useLaunchSource), then "Get clips in 1 click" starts the run;
//   • Assets: pick a video already in the library, same one-click start.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { AssetPicker } from "@/app/components/assets/AssetPicker";
import { DEFAULT_TEMPLATE_ID, indexForTemplateId } from "@/lib/captions/legacyStyleIndex";
import { ACCEPTED_VIDEO_TYPES } from "@/lib/autoclip-source";
import { useLaunchSource, type LaunchSourceView } from "./useLaunchSource";

type Length = "short" | "standard" | "long";
type Ratio = "9:16" | "1:1" | "16:9";

// The same bands as the AutoClip page's length presets.
const LENGTHS: { id: Length; label: string; min: number; max: number }[] = [
  { id: "short", label: "<30s", min: 5, max: 30 },
  { id: "standard", label: "15–60s", min: 15, max: 60 },
  { id: "long", label: "60s+", min: 60, max: 120 },
];
const RATIOS: Ratio[] = ["9:16", "1:1", "16:9"];
const CLIP_COUNT = 8;

const IcLink = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]" aria-hidden="true"><path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7" /></svg>;
const IcFolder = () => <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true"><path d="M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>;
const IcLibrary = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
const IcX = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="w-3 h-3" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** A preset that cycles through its options on click — one compact pill each. */
function CyclePill<T extends string>({ label, value, options, display, onChange }: {
  label: string; value: T; options: readonly T[]; display: (v: T) => string; onChange: (v: T) => void;
}) {
  const next = options[(options.indexOf(value) + 1) % options.length];
  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      aria-label={`${label}: ${display(value)}`}
      title={label}
      className="h-8 rounded-lg border border-line px-2.5 text-xs font-medium text-fg-muted hover:text-fg hover:border-fg/25 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
    >
      {display(value)}
    </button>
  );
}

/** The chosen video, OpusClip-style: frame, name, upload progress. */
function SourceBar({ view, onRemove, onRetry }: { view: LaunchSourceView; onRemove: () => void; onRetry: () => void }) {
  const t = useTranslations("Dashboard");
  const busy = view.state === "uploading" || view.state === "processing";
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3.5 px-2 sm:px-0">
      <div className="relative h-[52px] w-[52px] flex-shrink-0">
        <div className="h-full w-full overflow-hidden rounded-xl bg-bg">
          {view.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={view.thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : view.localUrl ? (
            <video src={view.localUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" aria-hidden />
          ) : null}
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-bg/60">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-fg/25 border-t-fg" aria-hidden />
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={busy ? t("home.cancelUpload") : t("home.removeVideo")}
          className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface-3 text-fg hover:bg-fg hover:text-bg before:absolute before:-inset-2 before:content-[''] outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
        >
          <IcX />
        </button>
      </div>
      <p className="min-w-0 flex-1 truncate text-[15px] text-fg-muted" title={view.name}>{view.name}</p>
      <p className="flex-shrink-0 text-sm font-semibold tabular-nums text-fg" role="status" aria-live="polite">
        {view.state === "uploading"
          ? t("home.uploadingPct", { percent: view.progress })
          : view.state === "processing"
            ? t("home.processing")
            : view.state === "ready"
              ? t("home.ready")
              : (
                <button type="button" onClick={onRetry} className="text-error underline-offset-2 hover:underline">
                  {t("home.retryUpload")}
                </button>
              )}
      </p>
    </div>
  );
}

/**
 * "Turn long videos into ___", the last words cycling through where clips end
 * up. English only: the other locales put the object mid-sentence, so they
 * keep their translated title as one static line. Screen readers get the plain
 * title either way.
 */
function HeroTitle() {
  const t = useTranslations("Dashboard");
  const locale = useLocale();
  const cls = "home-rise text-center text-[26px] sm:text-[34px] font-bold tracking-tight text-fg leading-tight";
  if (locale !== "en") return <h1 className={cls}>{t("heroTitle")}</h1>;
  const words = t.raw("heroWords") as string[];
  return (
    <h1 className={cls}>
      <span className="sr-only">{t("heroTitle")}</span>
      <span aria-hidden>
        {t("heroLead")}{" "}
        <span className="inline-block h-[1.25em] overflow-hidden align-bottom text-left text-primary">
          <span className="home-words flex flex-col">
            {[...words, words[0]].map((w, i) => <span key={i}>{w}</span>)}
          </span>
        </span>
      </span>
    </h1>
  );
}

export function AutoClipLaunchBox() {
  const t = useTranslations("Dashboard");
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [length, setLength] = useState<Length>("standard");
  const [ratio, setRatio] = useState<Ratio>("9:16");
  const [captions, setCaptions] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const launch = useLaunchSource();
  const view = launch.view;

  function presets(): URLSearchParams {
    const q = new URLSearchParams({ length, ratio });
    if (!captions) q.set("captions", "0");
    return q;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (view) {
      const band = LENGTHS.find((l) => l.id === length)!;
      void launch.start({
        minDuration: band.min,
        maxDuration: band.max,
        clipCount: CLIP_COUNT,
        aspectRatio: ratio,
        instructions: "",
        captionTemplateId: captions ? DEFAULT_TEMPLATE_ID : null,
        captionStyleIndex: captions ? indexForTemplateId(DEFAULT_TEMPLATE_ID) : -1,
      });
      return;
    }
    const value = url.trim();
    if (!isHttpUrl(value)) {
      setError(t("home.invalidUrl"));
      return;
    }
    const q = presets();
    q.set("url", value);
    router.push(`/dashboard/create/auto-clip?${q.toString()}`);
  }

  const uploading = view?.state === "uploading" || view?.state === "processing";
  const message = launch.pickError ?? launch.startError ?? (view?.state === "error" ? view.error : null) ?? error;
  const block = launch.paymentBlock;
  // The AutoClip page, with this video picked and the presets set — for a run
  // that needs the options this box doesn't have.
  const autoClipHref = `/dashboard/create/auto-clip?${presets().toString()}${launch.assetId ? `&asset=${encodeURIComponent(launch.assetId)}` : ""}`;

  return (
    <section className="mx-auto w-full max-w-[800px]">
      <HeroTitle />
      <p className="home-rise mx-auto mt-3 max-w-[560px] text-center text-sm sm:text-[15px] text-fg-muted" style={{ "--d": "0.08s" } as React.CSSProperties}>
        {t("heroSubtitle")}
      </p>

      <form onSubmit={submit} className="mt-6" noValidate>
        {/* A light circles the box (home-ring-spin); the 1.5px padding is the
            ring, the inner box keeps its own focus border. */}
        <div className="home-rise relative overflow-hidden rounded-[23.5px] p-[1.5px]" style={{ "--d": "0.16s" } as React.CSSProperties}>
        <span className="home-ring-spin" aria-hidden />
        <div
          className={`relative flex flex-col sm:flex-row sm:items-center gap-2 rounded-[22px] border border-transparent bg-surface-3 p-1.5 sm:pl-5 focus-within:border-primary/50 transition-colors ${uploading ? "launch-sweep" : ""}`}
        >
          {view ? (
            <SourceBar view={view} onRemove={launch.clear} onRetry={launch.retryUpload} />
          ) : (
            <label className="relative flex flex-1 min-w-0 items-center gap-3 px-3 sm:px-0">
              <span className="sr-only">{t("home.urlLabel")}</span>
              <span className="text-fg-subtle flex-shrink-0"><IcLink /></span>
              <input
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(null); }}
                placeholder={launch.checking ? t("home.checking") : t("home.urlPlaceholder")}
                aria-invalid={!!error}
                aria-describedby={message ? "launch-error" : undefined}
                className="w-full h-12 sm:h-[52px] bg-transparent text-base text-fg placeholder:text-fg-subtle outline-none"
              />
            </label>
          )}
          <button
            type="submit"
            disabled={!!view && (!launch.ready || launch.starting)}
            className="relative overflow-hidden h-12 sm:h-[52px] flex-shrink-0 rounded-2xl bg-fg px-7 text-base font-semibold text-bg hover:bg-fg/90 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70 disabled:cursor-not-allowed disabled:bg-fg/30 disabled:text-bg/70 disabled:hover:bg-fg/30"
          >
            {!view && <span className="home-shine" aria-hidden />}
            <span className="relative">{launch.starting ? t("home.starting") : t("home.getClips")}</span>
          </button>
        </div>
        </div>
        {message && <p id="launch-error" role="alert" className="mt-2 pl-4 text-xs text-error">{message}</p>}
        {block && (
          <div role="alert" className="mt-3 rounded-2xl border border-warning/40 bg-tint-amber px-4 py-3 text-sm text-fg">
            {block.kind === "free_limit" ? (
              <>
                {block.message}{" "}
                <Link href={block.upgradeUrl} className="font-semibold text-primary hover:underline">{t("home.upgrade")}</Link>
              </>
            ) : block.kind === "minutes" ? (
              <>
                {t("home.minutesShort")}{" "}
                {block.overflowCredits ? (
                  <Link href={autoClipHref} className="font-semibold text-primary hover:underline">{t("home.payWithCredits")}</Link>
                ) : null}
              </>
            ) : (
              t("home.creditsShort")
            )}
          </div>
        )}

        <div className="home-rise mt-4 flex flex-wrap items-center justify-between gap-3 px-2 sm:pl-[18px]" style={{ "--d": "0.24s" } as React.CSSProperties}>
          <div className="flex items-center gap-5">
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_VIDEO_TYPES.join(",")}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void launch.chooseFile(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={launch.checking || launch.starting}
              className="inline-flex h-9 items-center gap-2 text-sm font-semibold text-fg hover:text-primary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70 rounded-lg disabled:opacity-50"
            >
              <span className="text-success"><IcFolder /></span>
              {t("home.upload")}
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={launch.starting}
              className="inline-flex h-9 items-center gap-2 text-sm font-semibold text-fg hover:text-primary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70 rounded-lg disabled:opacity-50"
            >
              <span className="text-info"><IcLibrary /></span>
              {t("home.assets")}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <CyclePill label={t("home.ratio")} value={ratio} options={RATIOS} display={(r) => r} onChange={setRatio} />
            <CyclePill
              label={t("home.length")}
              value={length}
              options={LENGTHS.map((l) => l.id)}
              display={(id) => LENGTHS.find((l) => l.id === id)!.label}
              onChange={setLength}
            />
            <button
              type="button"
              aria-pressed={captions}
              onClick={() => setCaptions((c) => !c)}
              className={`h-8 rounded-lg border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
                captions ? "border-primary/40 text-fg" : "border-line text-fg-muted hover:text-fg"
              }`}
            >
              {captions ? t("home.captionsOn") : t("home.captionsOff")}
            </button>
          </div>
        </div>
      </form>

      <AssetPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        accept={["video"]}
        title={t("home.pickFromAssets")}
        onSelect={(asset) => {
          setPickerOpen(false);
          launch.chooseAsset(asset);
        }}
      />
    </section>
  );
}
