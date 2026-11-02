"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/app/components/ui/Modal";
import { Button } from "@/app/components/ui/Button";
import { TTS_LANGUAGES, ttsLanguageLabel, AUTO_LANGUAGE } from "@/lib/voices/models";
import type { CatalogVoice } from "./useVoiceCatalog";

// The voice picker for the voiceover and voice changer tools.
//
// Built for ~220 voices in 59 languages, where the modal it replaced (a flat
// grid searchable by name) was built for 22. Language first, because that is
// how people choose a narrator: a language's own Voice Library voices come
// first, then the account's multilingual voices, which read any of the 94
// languages with their own accent. Then accent, gender and use case.
//
// Full screen, the house rule for panels. Each card holds three separate
// buttons (choose, play, favourite) — the old card was one role="button" with
// two buttons nested inside it, and every play button was named "Preview voice".

const USE_CASES: Record<string, string> = {
  narrative_story: "Narration",
  social_media: "Social media",
  conversational: "Conversational",
  informative_educational: "Educational",
  advertisement: "Ads",
  characters_animation: "Characters",
  entertainment_tv: "Entertainment",
};

export const styleLabel = (u: string | null) => (u ? USE_CASES[u] ?? u.replace(/_/g, " ") : null);

/** "Spanish · Mexican" for a library voice, "Multilingual" for the account's own. */
export function voiceLanguageLabel(v: CatalogVoice): string {
  if (v.category !== "library") return "Multilingual";
  const lang = ttsLanguageLabel(v.languages[0] ?? "");
  return v.accent && v.accent !== "Standard" ? `${lang} · ${v.accent}` : lang;
}

function IcHeart({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    </svg>
  );
}
function IcPlay() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden><path d="M8 5v14l11-7z" /></svg>;
}
function IcStop() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden><path d="M6 6h12v12H6z" /></svg>;
}
function IcSearch() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="h-4 w-4" aria-hidden><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>;
}

/** Initials on a token surface — the old avatars were rainbow hex. */
export function VoiceAvatar({ voice, size = 40, selected = false }: { voice: Pick<CatalogVoice, "label">; size?: number; selected?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex flex-shrink-0 select-none items-center justify-center rounded-full font-bold ${selected ? "bg-brand text-on-primary" : "bg-surface-3 text-fg"}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {voice.label.charAt(0).toUpperCase()}
    </span>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${
        active ? "border-tint-emerald-border bg-tint-emerald text-fg" : "border-line text-fg-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

interface Section { id: string; title: string; note?: string; voices: CatalogVoice[] }

export interface VoiceLibraryPickerProps {
  open: boolean;
  onClose: () => void;
  voices: CatalogVoice[];
  value: string;
  onSelect: (voice: CatalogVoice) => void;
  /** The tool's language, used as the starting filter ("auto" = all). */
  language?: string;
  favourites: Set<string>;
  onToggleFavourite: (slug: string) => void;
}

export default function VoiceLibraryPicker({ open, onClose, voices, value, onSelect, language = AUTO_LANGUAGE, favourites, onToggleFavourite }: VoiceLibraryPickerProps) {
  const [query, setQuery] = useState("");
  const [lang, setLang] = useState("all");
  const [accent, setAccent] = useState("all");
  const [gender, setGender] = useState<"all" | "female" | "male">("all");
  const [useCase, setUseCase] = useState("all");
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const synthesized = useRef(new Map<string, string>());

  // Each opening starts from the tool's language.
  useEffect(() => {
    if (!open) return;
    setLang(language === AUTO_LANGUAGE ? "all" : language);
    setAccent("all");
    setQuery("");
  }, [open, language]);

  useEffect(() => {
    if (open) return;
    audioRef.current?.pause();
    setPlaying(null);
  }, [open]);

  const languages = useMemo(() => {
    const native = new Set(voices.filter((v) => v.category === "library").flatMap((v) => v.languages));
    return TTS_LANGUAGES.map((l) => ({ ...l, native: native.has(l.code) || l.code === "en" }));
  }, [voices]);

  const accents = useMemo(() => {
    if (lang === "all") return [];
    const set = new Set(
      voices.filter((v) => v.category === "library" && v.languages.includes(lang) && v.accent).map((v) => v.accent as string),
    );
    return [...set].sort();
  }, [voices, lang]);

  const useCases = useMemo(() => [...new Set(voices.map((v) => v.useCase).filter(Boolean) as string[])].sort(), [voices]);

  const sections = useMemo<Section[]>(() => {
    const q = query.trim().toLowerCase();
    const matches = (v: CatalogVoice) =>
      (gender === "all" || v.gender === gender) &&
      (useCase === "all" || v.useCase === useCase) &&
      (accent === "all" || v.accent === accent) &&
      (!q || `${v.label} ${v.description ?? ""} ${v.accent ?? ""} ${voiceLanguageLabel(v)} ${styleLabel(v.useCase) ?? ""}`.toLowerCase().includes(q));
    const account = voices.filter((v) => v.category !== "library");
    const library = voices.filter((v) => v.category === "library");
    const out: Section[] = [];

    if (lang === "all") {
      const favs = voices.filter((v) => favourites.has(v.slug) && matches(v));
      if (favs.length) out.push({ id: "fav", title: "Favourites", voices: favs });
      out.push({ id: "account", title: "Multilingual", note: "Read any language, in their own accent.", voices: account.filter(matches) });
      const byLang = new Map<string, CatalogVoice[]>();
      for (const v of library.filter(matches)) {
        const code = v.languages[0] ?? "";
        byLang.set(code, [...(byLang.get(code) ?? []), v]);
      }
      for (const [code, list] of [...byLang].sort((a, b) => ttsLanguageLabel(a[0]).localeCompare(ttsLanguageLabel(b[0])))) {
        out.push({ id: code, title: ttsLanguageLabel(code), voices: list });
      }
    } else {
      const label = ttsLanguageLabel(lang);
      const native = library.filter((v) => v.languages.includes(lang) && matches(v));
      if (lang === "en") native.push(...account.filter(matches));
      out.push({ id: "native", title: `${label} voices`, voices: native });
      if (lang !== "en" && accent === "all") {
        out.push({ id: "multi", title: "Multilingual", note: `Read ${label} in their own accent.`, voices: account.filter(matches) });
      }
    }
    return out.filter((s) => s.voices.length > 0);
  }, [voices, lang, accent, gender, useCase, query, favourites]);

  const total = sections.reduce((n, s) => n + s.voices.length, 0);

  async function play(v: CatalogVoice) {
    audioRef.current?.pause();
    if (playing === v.slug) { setPlaying(null); return; }
    let src = v.previewUrl ?? synthesized.current.get(v.slug) ?? null;
    if (!src) {
      // A paid TTS call, so only for a voice with no hosted sample.
      setLoading(v.slug);
      try {
        const res = await fetch("/api/tools/voice-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: v.slug }),
        });
        if (!res.ok) throw new Error("preview failed");
        src = URL.createObjectURL(await res.blob());
        synthesized.current.set(v.slug, src);
      } catch {
        return;
      } finally {
        setLoading(null);
      }
    }
    const audio = new Audio(src);
    audioRef.current = audio;
    audio.onended = () => setPlaying(null);
    setPlaying(v.slug);
    audio.play().catch(() => setPlaying(null));
  }

  return (
    <Modal open={open} onClose={onClose} variant="fullscreen" ariaLabel="Choose a voice">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 pb-28 sm:px-8">
        <div className="-mt-10 pr-14">
          <h2 className="text-[22px] font-bold text-fg">Choose a voice</h2>
          <p className="text-[13px] text-fg-muted">{voices.length} voices in {languages.filter((l) => l.native).length} languages, plus multilingual voices for every other one.</p>
        </div>

        <div className="sticky top-0 z-[5] -mx-4 flex flex-col gap-3 border-b border-line bg-bg px-4 py-3 sm:-mx-8 sm:px-8">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle"><IcSearch /></span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, accent, style…"
                aria-label="Search voices"
                className="w-full rounded-xl border border-line bg-surface-1 py-2.5 pl-9 pr-3 text-[14px] text-fg outline-none placeholder:text-fg-subtle focus:border-primary focus:ring-2 focus:ring-primary/25"
              />
            </div>
            <select
              value={lang}
              onChange={(e) => { setLang(e.target.value); setAccent("all"); }}
              aria-label="Language"
              className="rounded-xl border border-line bg-surface-1 px-3 py-2.5 text-[14px] text-fg outline-none focus:border-primary sm:w-60"
            >
              <option value="all">All languages</option>
              <optgroup label="With native voices">
                {languages.filter((l) => l.native).map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </optgroup>
              <optgroup label="Multilingual voices only">
                {languages.filter((l) => !l.native).map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </optgroup>
            </select>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="group" aria-label="Filters">
            {(["all", "female", "male"] as const).map((g) => (
              <Chip key={g} active={gender === g} onClick={() => setGender(g)}>{g === "all" ? "Any gender" : g === "female" ? "Female" : "Male"}</Chip>
            ))}
            <span className="mx-1 w-px flex-shrink-0 bg-line" aria-hidden />
            <Chip active={useCase === "all"} onClick={() => setUseCase("all")}>Any style</Chip>
            {useCases.map((u) => <Chip key={u} active={useCase === u} onClick={() => setUseCase(useCase === u ? "all" : u)}>{styleLabel(u)}</Chip>)}
          </div>

          {accents.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="group" aria-label="Accent">
              <Chip active={accent === "all"} onClick={() => setAccent("all")}>Any accent</Chip>
              {accents.map((a) => <Chip key={a} active={accent === a} onClick={() => setAccent(accent === a ? "all" : a)}>{a}</Chip>)}
            </div>
          )}
        </div>

        <p className="sr-only" aria-live="polite">{total} voices shown</p>

        {sections.length === 0 ? (
          <p className="py-12 text-center text-[13px] text-fg-subtle">No voices match those filters.</p>
        ) : (
          sections.map((s) => (
            <section key={s.id} aria-labelledby={`vs-${s.id}`} className="flex flex-col gap-3" style={{ contentVisibility: "auto", containIntrinsicSize: "auto 400px" }}>
              <div className="flex items-baseline gap-2">
                <h3 id={`vs-${s.id}`} className="text-[14px] font-semibold text-fg">{s.title}</h3>
                <span className="text-[12px] text-fg-subtle">{s.voices.length}</span>
                {s.note && <span className="text-[12px] text-fg-subtle">· {s.note}</span>}
              </div>
              <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {s.voices.map((v) => {
                  const selected = v.slug === value;
                  const fav = favourites.has(v.slug);
                  const style = styleLabel(v.useCase);
                  return (
                    <li
                      key={`${s.id}-${v.slug}`}
                      className={`flex items-center gap-3 rounded-2xl border p-3 transition-colors ${selected ? "border-brand bg-tint-emerald" : "border-line bg-panel hover:border-line-strong"}`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(v)}
                        aria-pressed={selected}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                      >
                        <VoiceAvatar voice={v} size={38} selected={selected} />
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-semibold text-fg">{v.label}</span>
                          <span className="block truncate text-[11.5px] text-fg-muted">
                            {[v.gender === "female" ? "Female" : v.gender === "male" ? "Male" : "Neutral", voiceLanguageLabel(v), style].filter(Boolean).join(" · ")}
                          </span>
                          {v.description && <span className="block truncate text-[11.5px] text-fg-subtle">{v.description}</span>}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleFavourite(v.slug)}
                        aria-pressed={fav}
                        aria-label={`Favourite ${v.label}`}
                        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors ${fav ? "text-brand" : "text-fg-subtle hover:text-fg"}`}
                      >
                        <IcHeart filled={fav} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void play(v)}
                        disabled={loading !== null && loading !== v.slug}
                        aria-label={playing === v.slug ? `Stop ${v.label}'s sample` : `Play ${v.label}'s sample`}
                        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-line text-fg-muted transition-colors hover:border-brand hover:text-fg disabled:opacity-40"
                      >
                        {loading === v.slug ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : playing === v.slug ? <IcStop /> : <IcPlay />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3">
          <p className="min-w-0 truncate text-[13px] text-fg-muted">
            Selected: <span className="font-semibold text-fg">{voices.find((v) => v.slug === value)?.label ?? "—"}</span>
          </p>
          <Button type="button" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}
