"use client";

// Home's hero: one box that starts AutoClip, the way the dashboard's job is
// framed — paste the long video, get clips. The presets beside it ride along
// as query params; the AutoClip page reads them as its initial form state and
// probes the link itself (UrlImportField `initialUrl`), so nothing here talks
// to the backend.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/app/components/ui/Button";
import type { ClipRow } from "@/app/dashboard/clips/hooks/useClipsLibrary";

type Length = "short" | "standard" | "long";
type Ratio = "9:16" | "1:1" | "16:9";

const LENGTHS: { id: Length; label: string }[] = [
  { id: "short", label: "<30s" },
  { id: "standard", label: "15–60s" },
  { id: "long", label: "60s+" },
];
const RATIOS: Ratio[] = ["9:16", "1:1", "16:9"];

const IcLink = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7" /></svg>;
const IcUpload = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>;
const IcSpark = () => <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true"><path d="M12 2l2.2 6.3L20.5 10l-6.3 2.2L12 18.5l-2.2-6.3L3.5 10l6.3-1.7z" /></svg>;

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`h-7 rounded-full border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
        pressed ? "border-primary/50 bg-primary/15 text-fg" : "border-line bg-surface-1 text-fg-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

export function AutoClipLaunchBox({ eyebrow, clips }: { eyebrow: string; clips: ClipRow[] }) {
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
    <section className="relative flex items-center gap-8 rounded-[var(--radius-feature)] border border-line bg-surface-2 px-5 sm:px-8 py-7 sm:py-8 overflow-hidden">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">{eyebrow}</p>
        <h1 className="mt-2.5 text-2xl sm:text-[32px] font-semibold tracking-tight text-fg leading-tight">{t("heroTitle")}</h1>
        <p className="mt-2 text-sm text-fg-muted leading-relaxed max-w-xl">{t("heroSubtitle")}</p>

        <form onSubmit={submit} className="mt-6 max-w-2xl" noValidate>
          <div className="flex flex-col sm:flex-row gap-2 rounded-2xl border border-line bg-bg/60 p-2 focus-within:border-primary/50 transition-colors">
            <label className="relative flex-1 min-w-0">
              <span className="sr-only">{t("home.urlLabel")}</span>
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"><IcLink /></span>
              <input
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(null); }}
                placeholder={t("home.urlPlaceholder")}
                aria-invalid={!!error}
                aria-describedby={error ? "launch-error" : undefined}
                className="w-full h-11 rounded-xl bg-transparent pl-9 pr-3 text-sm text-fg placeholder:text-fg-subtle outline-none"
              />
            </label>
            <div className="flex gap-2">
              <Button variant="secondary" size="md" href={`/dashboard/create/auto-clip?${presets().toString()}`} icon={<IcUpload />} className="flex-1 sm:flex-none">
                {t("home.upload")}
              </Button>
              <Button type="submit" variant="primary" size="md" icon={<IcSpark />} className="flex-1 sm:flex-none">
                {t("home.getClips")}
              </Button>
            </div>
          </div>
          {error && <p id="launch-error" role="alert" className="mt-2 text-xs text-error">{error}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-1.5" role="group" aria-label={t("home.length")}>
              <span className="text-[11px] text-fg-subtle mr-0.5">{t("home.length")}</span>
              {LENGTHS.map((l) => <Chip key={l.id} pressed={length === l.id} onClick={() => setLength(l.id)}>{l.label}</Chip>)}
            </div>
            <div className="flex items-center gap-1.5" role="group" aria-label={t("home.ratio")}>
              <span className="text-[11px] text-fg-subtle mr-0.5">{t("home.ratio")}</span>
              {RATIOS.map((r) => <Chip key={r} pressed={ratio === r} onClick={() => setRatio(r)}>{r}</Chip>)}
            </div>
            <Chip pressed={captions} onClick={() => setCaptions((c) => !c)}>{t("home.captions")}</Chip>
          </div>
        </form>
      </div>

      {clips.length > 0 && (
        // The user's own best clips, fanned — what the product made for them
        // rather than decoration. 2xl only: beside the sidebar and rail, any
        // narrower and it squeezes the link field down to a stub.
        <div className="relative hidden 2xl:block w-[300px] h-[250px] flex-shrink-0" aria-hidden="true">
          {clips.map((c, i) => (
            <div
              key={c.id}
              className={`absolute overflow-hidden rounded-2xl border bg-surface-3 aspect-[9/16] ${
                i === 0
                  ? "left-[86px] top-0 w-[130px] z-10 border-primary/40"
                  : i === 1
                    ? "left-0 top-[30px] w-[118px] -rotate-6 border-line"
                    : "right-0 top-[30px] w-[118px] rotate-6 border-line"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.thumbnailUrl!} alt="" className="w-full h-full object-cover" />
              {i === 0 && typeof c.score === "number" && (
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-bg/80 text-xs font-bold text-primary">{c.score}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
