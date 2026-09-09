"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { VOICE_SEED, type VoiceEntry } from "@/lib/voices/catalog";
import { CAPTION_LANGUAGES } from "@/lib/languages";

// The voice picker. One component, every surface.
//
// It replaces five bespoke pickers, each with its own compiled-in list, which
// had drifted apart in both membership and description — and one of which built
// preview URLs by hand from a scraped provider CDN path.
//
// The list is FETCHED (admin overrides and account validation are server-side
// facts) with the seed compiled in as the offline fallback — the same contract
// as CaptionStyleGrid. `configured: false` renders as an explicit warning
// rather than as an empty grid, because "this account has no voices" and "the
// key is wrong" look identical otherwise, and the second is what is actually
// true today.

export interface PickerVoice {
  slug: string;
  label: string;
  description: string | null;
  gender: string;
  age: string;
  accent: string | null;
  languages: string[];
  category: string;
  free: boolean;
  creditMultiplier: number;
  previewUrl: string | null;
}

/** The seed, in the shape the API returns, for when the fetch fails. */
const FALLBACK: PickerVoice[] = VOICE_SEED
  .filter((v: VoiceEntry) => !v.aliasOf && v.active !== false)
  .map((v) => ({
    slug: v.slug,
    label: v.label,
    description: v.description ?? null,
    gender: v.gender,
    age: v.age,
    accent: v.accent ?? null,
    languages: v.languages,
    category: v.category,
    free: v.free,
    creditMultiplier: v.creditMultiplier,
    previewUrl: null,
  }));

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface VoicePickerProps {
  value: string;
  onChange: (slug: string) => void;
  disabled?: boolean;
  /** Heading. Surfaces word this differently ("Narrator", "Reply voice"). */
  title?: string;
  /** One column instead of two, for wizard side panels. */
  compact?: boolean;
}

export default function VoicePicker({
  value,
  onChange,
  disabled,
  title,
  compact,
}: VoicePickerProps) {
  const [voices, setVoices] = useState<PickerVoice[]>(FALLBACK);
  const [configured, setConfigured] = useState(true);
  const [gender, setGender] = useState<"all" | "male" | "female">("all");
  const [language, setLanguage] = useState("all");
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/voices", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d || !Array.isArray(d.voices)) return;
        setConfigured(d.configured !== false);
        if (d.voices.length > 0) setVoices(d.voices);
      })
      .catch(() => { /* keep the seed */ });
    return () => { cancelled = true; };
  }, []);

  // Stop any preview on unmount, or a half-played sample keeps talking over
  // the page it came from.
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const languages = useMemo(() => {
    const present = new Set(voices.flatMap((v) => v.languages));
    return CAPTION_LANGUAGES.filter((l) => present.has(l.code));
  }, [voices]);

  const visible = useMemo(
    () =>
      voices.filter(
        (v) =>
          (gender === "all" || v.gender === gender) &&
          (language === "all" || v.languages.includes(language)),
      ),
    [voices, gender, language],
  );

  async function preview(v: PickerVoice) {
    audioRef.current?.pause();
    if (playing === v.slug) { setPlaying(null); return; }
    setPlaying(v.slug);
    try {
      // The provider's own preview mp3 costs nothing to play. Synthesizing one
      // is a real TTS call, so it is the fallback, not the default.
      let src = v.previewUrl;
      if (!src) {
        const res = await fetch("/api/tools/voice-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ slug: v.slug }),
        });
        if (!res.ok) throw new Error("preview failed");
        src = URL.createObjectURL(await res.blob());
      }
      const audio = new Audio(src);
      audioRef.current = audio;
      audio.onended = () => setPlaying(null);
      await audio.play();
    } catch {
      setPlaying(null);
    }
  }

  return (
    <div className="space-y-3">
      {title && <p className="text-[13px] font-semibold text-ink">{title}</p>}

      {!configured && (
        <p className="rounded-lg border border-tint-amber-border bg-tint-amber px-3 py-2 text-[11.5px] text-ink">
          Voice generation is not configured, so this list may be out of date and
          generating will fail.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="flex gap-1" role="tablist" aria-label="Voice gender">
          {(["all", "male", "female"] as const).map((g) => (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={gender === g}
              disabled={disabled}
              onClick={() => setGender(g)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors disabled:opacity-40 ${
                gender === g
                  ? "bg-tint-emerald text-ink border border-tint-emerald-border"
                  : "text-ink-soft border border-card-border hover:text-ink"
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        <select
          value={language}
          disabled={disabled}
          onChange={(e) => setLanguage(e.target.value)}
          aria-label="Voice language"
          className="rounded-full border border-card-border bg-panel px-2.5 py-1 text-[11px] font-semibold text-ink-soft disabled:opacity-40"
        >
          <option value="all">All languages</option>
          {languages.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </div>

      <div className={compact ? "flex flex-col gap-1.5" : "grid grid-cols-1 sm:grid-cols-2 gap-2"}>
        {visible.map((v) => {
          const selected = value === v.slug;
          return (
            <div
              key={v.slug}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors ${
                selected ? "border-brand bg-tint-emerald" : "border-card-border bg-panel hover:border-brand/50"
              }`}
            >
              <button
                type="button"
                disabled={disabled}
                aria-pressed={selected}
                onClick={() => onChange(v.slug)}
                className="flex-1 min-w-0 text-left disabled:opacity-40 cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-[12.5px] font-semibold text-ink">{v.label}</span>
                  {v.creditMultiplier > 1 && (
                    <span
                      className="rounded-full border border-tint-amber-border bg-tint-amber px-1.5 text-[8px] font-bold text-ink"
                      title={`Costs ${v.creditMultiplier}x the usual credits`}
                    >
                      {v.creditMultiplier}x CREDITS
                    </span>
                  )}
                </span>
                <span className="block truncate text-[11px] text-ink-soft">
                  {v.description || [v.accent, v.gender, v.age].filter(Boolean).join(" · ")}
                </span>
              </button>

              <button
                type="button"
                disabled={disabled}
                onClick={() => preview(v)}
                aria-label={playing === v.slug ? `Stop ${v.label}` : `Play ${v.label}`}
                className="shrink-0 w-7 h-7 rounded-full border border-card-border text-ink-soft hover:text-ink hover:border-brand transition-colors cursor-pointer disabled:opacity-40"
              >
                {playing === v.slug ? "■" : "▶"}
              </button>
            </div>
          );
        })}
      </div>

      {visible.length === 0 && (
        <p className="text-[11.5px] text-ink-soft">No voices match those filters.</p>
      )}
    </div>
  );
}
