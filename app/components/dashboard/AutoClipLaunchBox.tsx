"use client";

// Home's hero: one box that starts AutoClip, the way the dashboard's job is
// framed — paste the long video, get clips. The presets beside it ride along
// as query params; the AutoClip page reads them as its initial form state and
// probes the link itself (UrlImportField `initialUrl`), so nothing here talks
// to the backend.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";

type Length = "short" | "standard" | "long";
type Ratio = "9:16" | "1:1" | "16:9";

const LENGTHS: { id: Length; label: string }[] = [
  { id: "short", label: "<30s" },
  { id: "standard", label: "15–60s" },
  { id: "long", label: "60s+" },
];
const RATIOS: Ratio[] = ["9:16", "1:1", "16:9"];

const IcLink = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]" aria-hidden="true"><path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7" /></svg>;
const IcFolder = () => <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true"><path d="M3 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>;

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

export function AutoClipLaunchBox() {
  const t = useTranslations("Dashboard");
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [length, setLength] = useState<Length>("standard");
  const [ratio, setRatio] = useState<Ratio>("9:16");
  const [captions, setCaptions] = useState(true);

  function presets(): URLSearchParams {
    const q = new URLSearchParams({ length, ratio });
    if (!captions) q.set("captions", "0");
    return q;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = url.trim();
    if (!isHttpUrl(value)) {
      setError(t("home.invalidUrl"));
      return;
    }
    const q = presets();
    q.set("url", value);
    router.push(`/dashboard/create/auto-clip?${q.toString()}`);
  }

  return (
    <section className="mx-auto w-full max-w-[800px]">
      <h1 className="text-center text-[26px] sm:text-[34px] font-bold tracking-tight text-fg leading-tight">{t("heroTitle")}</h1>

      <form onSubmit={submit} className="mt-6" noValidate>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-[22px] border border-fg/15 bg-surface-3 p-1.5 sm:pl-5 focus-within:border-primary/50 transition-colors">
          <label className="relative flex flex-1 min-w-0 items-center gap-3 px-3 sm:px-0">
            <span className="sr-only">{t("home.urlLabel")}</span>
            <span className="text-fg-subtle flex-shrink-0"><IcLink /></span>
            <input
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError(null); }}
              placeholder={t("home.urlPlaceholder")}
              aria-invalid={!!error}
              aria-describedby={error ? "launch-error" : undefined}
              className="w-full h-12 sm:h-[52px] bg-transparent text-base text-fg placeholder:text-fg-subtle outline-none"
            />
          </label>
          <button
            type="submit"
            className="h-12 sm:h-[52px] flex-shrink-0 rounded-2xl bg-fg px-7 text-base font-semibold text-bg hover:bg-fg/90 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            {t("home.getClips")}
          </button>
        </div>
        {error && <p id="launch-error" role="alert" className="mt-2 pl-4 text-xs text-error">{error}</p>}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-2 sm:pl-[18px]">
          <Link
            href={`/dashboard/create/auto-clip?${presets().toString()}`}
            className="inline-flex items-center gap-2 text-sm font-semibold text-fg hover:text-primary transition-colors"
          >
            <span className="text-success"><IcFolder /></span>
            {t("home.upload")}
          </Link>
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
    </section>
  );
}
