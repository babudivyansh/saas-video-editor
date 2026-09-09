"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { Switch } from "@/app/components/ui/Switch";
import { CAPTION_TEMPLATES, CAPTION_CATEGORIES, type CaptionCategory } from "@/lib/caption-templates";

// Caption templates + translation, as controls rather than API surface.
//
// The list is FETCHED rather than read straight from lib/caption-templates.ts,
// even though that file is client-safe and used to be imported directly here.
// Two things only the server knows now decide what should be offered: the
// admin override layer (a template can be re-pointed, re-priced or hidden with
// no deploy) and provider-mapping validation (a premium style whose upstream
// template no longer exists is deactivated so it can't fail at paid render
// time). The static import stays as the offline fallback, so a failed fetch
// degrades to "the built-in styles" instead of an empty picker.

interface ApiTemplate {
  id: string;
  label: string;
  hint: string;
  category: CaptionCategory | null;
  premium: boolean;
  previewImageUrl: string | null;
  previewVideoUrl: string | null;
  /** True when picking this spends credits on an external render. */
  requiresRender: boolean;
}

const FALLBACK: ApiTemplate[] = CAPTION_TEMPLATES.map((t) => ({
  id: t.id,
  label: t.label,
  hint: t.hint,
  category: t.category ?? null,
  premium: t.premium ?? false,
  previewImageUrl: t.previewImageUrl ?? null,
  previewVideoUrl: t.previewVideoUrl ?? null,
  requiresRender: (t.provider ?? "native") !== "native",
}));

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface CaptionTemplatePickerProps {
  value: string | null;
  onChange: (templateId: string) => void;
  disabled?: boolean;
}

export function CaptionTemplatePicker({ value, onChange, disabled }: CaptionTemplatePickerProps) {
  const [templates, setTemplates] = useState<ApiTemplate[]>(FALLBACK);
  const [category, setCategory] = useState<CaptionCategory | "All">("All");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/caption-templates", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && Array.isArray(d?.templates) && d.templates.length > 0) setTemplates(d.templates);
      })
      .catch(() => { /* keep the built-in list */ });
    return () => { cancelled = true; };
  }, []);

  // Only offer a tab that actually has something in it — an empty "Podcast"
  // tab reads as a broken picker rather than a deliberate catalogue.
  const tabs = useMemo(() => {
    const present = new Set(templates.map((t) => t.category).filter(Boolean));
    return ["All", ...CAPTION_CATEGORIES.filter((c) => present.has(c))] as const;
  }, [templates]);

  const visible = useMemo(
    () => (category === "All" ? templates : templates.filter((t) => t.category === category)),
    [templates, category],
  );

  return (
    <div className="space-y-2.5">
      <div>
        <label className="text-xs font-semibold text-ink">Caption style</label>
        <p className="text-[10px] text-ink-soft mt-0.5">
          A complete look — typography, keyword colour and emoji — in one choice.
        </p>
      </div>

      {tabs.length > 2 && (
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Caption style categories">
          {tabs.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={category === c}
              onClick={() => setCategory(c as CaptionCategory | "All")}
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                category === c
                  ? "bg-tint-emerald text-ink border border-tint-emerald-border"
                  : "text-ink-soft border border-card-border hover:text-ink"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {visible.map((t) => {
          const selected = value === t.id;
          return (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onChange(t.id)}
              className={`overflow-hidden rounded-xl border text-left transition-colors disabled:opacity-40 ${
                selected ? "border-brand bg-tint-emerald" : "border-card-border bg-panel hover:bg-panel-raised"
              }`}
            >
              {t.previewImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={t.previewImageUrl}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="h-16 w-full object-cover"
                />
              )}
              <span className="block p-2.5">
                <span className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-ink">{t.label}</span>
                  {t.premium && (
                    <span className="rounded-full border border-tint-amber-border bg-tint-amber px-1.5 py-px text-[9px] font-semibold text-ink">
                      Premium
                    </span>
                  )}
                </span>
                <span className="text-[10px] text-ink-soft block mt-0.5 leading-tight">{t.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {visible.some((t) => t.requiresRender && t.id === value) && (
        <p className="text-[10px] text-ink-soft">
          Premium styles are rendered after you export, and cost credits per minute of clip.
        </p>
      )}
    </div>
  );
}

// ── Premium caption controls ────────────────────────────────────────────────

export interface CaptionRenderControlsProps {
  /** 0-100, percent of frame height. Higher = lower on screen. */
  positionY: number;
  onPositionYChange: (y: number) => void;
  hookEnabled: boolean;
  onHookEnabledChange: (on: boolean) => void;
  hookText: string;
  onHookTextChange: (text: string) => void;
  /** Called to fetch AI hook suggestions. Returns [] when unavailable. */
  onSuggestHooks?: () => Promise<string[]>;
  applyToAll: boolean;
  onApplyToAllChange: (on: boolean) => void;
  disabled?: boolean;
}

/**
 * The controls that only matter for a premium (provider-rendered) style.
 *
 * Deliberately small: caption position, an optional hook, and apply-to-all.
 * Everything the provider CAN do that Clipiro already does better — B-roll,
 * silence removal, auto-zoom — is not surfaced here at all. The user should
 * feel like they are using Clipiro, not a wrapped vendor editor.
 */
export function CaptionRenderControls({
  positionY, onPositionYChange,
  hookEnabled, onHookEnabledChange,
  hookText, onHookTextChange,
  onSuggestHooks,
  applyToAll, onApplyToAllChange,
  disabled,
}: CaptionRenderControlsProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingHooks, setLoadingHooks] = useState(false);

  // Caption vocabulary lives on the account, so it loads and saves itself here
  // rather than being threaded through the clip's style payload — it is not a
  // property of this clip.
  const [vocabDraft, setVocabDraft] = useState("");
  const [vocabBusy, setVocabBusy] = useState(false);
  const [vocabSaved, setVocabSaved] = useState(false);
  const loadedVocab = useRef(false);

  useEffect(() => {
    if (loadedVocab.current) return;
    loadedVocab.current = true;
    fetch("/api/caption-vocabulary", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d?.terms)) setVocabDraft(d.terms.join(", ")); })
      .catch(() => { /* the field just starts empty */ });
  }, []);

  async function saveVocab() {
    const terms = vocabDraft.split(",").map((t) => t.trim()).filter(Boolean);
    setVocabBusy(true);
    setVocabSaved(false);
    try {
      const res = await fetch("/api/caption-vocabulary", {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ terms }),
      });
      if (res.ok) {
        const d = await res.json();
        // Reflect what the server actually stored — it dedupes and caps, so
        // the field would otherwise lie about what will be sent.
        if (Array.isArray(d.terms)) setVocabDraft(d.terms.join(", "));
        setVocabSaved(true);
        setTimeout(() => setVocabSaved(false), 2000);
      }
    } catch {
      /* a failed save is not worth an error toast on blur; the value stays typed */
    } finally {
      setVocabBusy(false);
    }
  }

  async function suggest() {
    if (!onSuggestHooks) return;
    setLoadingHooks(true);
    try {
      setSuggestions(await onSuggestHooks());
    } catch {
      setSuggestions([]); // the manual text box below is always the fallback
    } finally {
      setLoadingHooks(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-card-border bg-panel p-3">
      <div>
        <label htmlFor="caption-position-y" className="text-xs font-semibold text-ink">
          Caption position
        </label>
        <p className="text-[10px] text-ink-soft mt-0.5">
          Drag up to keep captions clear of the speaker&apos;s face.
        </p>
        <input
          id="caption-position-y"
          type="range"
          min={20}
          max={90}
          step={1}
          value={positionY}
          disabled={disabled}
          onChange={(e) => onPositionYChange(Number(e.target.value))}
          className="mt-1.5 w-full accent-brand"
        />
        <div className="flex justify-between text-[9px] text-ink-soft">
          <span>Higher</span>
          <span>{positionY}%</span>
          <span>Lower</span>
        </div>
      </div>

      <div className="border-t border-card-border pt-3">
        <Switch checked={hookEnabled} onChange={onHookEnabledChange} label="Add hook title" disabled={disabled} />
        {hookEnabled && (
          <div className="mt-2 space-y-2">
            <input
              type="text"
              value={hookText}
              maxLength={60}
              disabled={disabled}
              onChange={(e) => onHookTextChange(e.target.value)}
              placeholder="The line that stops the scroll"
              className="w-full rounded-lg border border-card-border bg-panel-raised px-2 py-1.5 text-xs text-ink"
            />
            {onSuggestHooks && (
              <Button size="sm" variant="secondary" onClick={() => void suggest()} disabled={disabled || loadingHooks}>
                {loadingHooks ? "Thinking…" : "Suggest hooks"}
              </Button>
            )}
            {suggestions.length > 0 && (
              <div className="space-y-1">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onHookTextChange(s)}
                    className="block w-full rounded-lg border border-card-border bg-panel-raised px-2 py-1.5 text-left text-[11px] text-ink hover:bg-tint-emerald"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-card-border pt-3">
        <label htmlFor="caption-vocabulary" className="text-xs font-semibold text-ink">
          Caption vocabulary
        </label>
        <p className="text-[10px] text-ink-soft mt-0.5">
          Names and jargon the transcriber gets wrong. Saved to your account and used on every clip.
        </p>
        <input
          id="caption-vocabulary"
          type="text"
          value={vocabDraft}
          disabled={disabled || vocabBusy}
          onChange={(e) => setVocabDraft(e.target.value)}
          onBlur={() => void saveVocab()}
          placeholder="Clipiro, Razorpay, Next.js"
          className="mt-1.5 w-full rounded-lg border border-card-border bg-panel-raised px-2 py-1.5 text-xs text-ink"
        />
        {vocabSaved && <p className="text-[10px] text-success mt-1">Saved.</p>}
      </div>

      <div className="border-t border-card-border pt-3">
        <Switch
          checked={applyToAll}
          onChange={onApplyToAllChange}
          label="Apply this style to all selected clips"
          disabled={disabled}
        />
        {/* Saying this out loud matters: applying a style to twenty clips and
            silently rendering twenty paid clips would be a very expensive
            surprise. Apply-to-all changes the SETTING only. */}
        <p className="text-[10px] text-ink-soft mt-1">
          Updates the style on every selected clip. Nothing is rendered until you export.
        </p>
      </div>
    </div>
  );
}

interface Language { code: string; label: string }

export interface TranslateCaptionsProps {
  projectId: string;
  clipId: string;
  disabled?: boolean;
  onQueued: () => void;
}

export function TranslateCaptions({ projectId, clipId, disabled, onQueued }: TranslateCaptionsProps) {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/clips/${clipId}/translate`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => {
        setLanguages(d.languages ?? []);
        if (d.languages?.[0]) setTarget(d.languages[0].code);
      })
      .catch(() => { /* the control simply stays empty */ });
  }, [projectId, clipId]);

  async function translate() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/clips/${clipId}/translate`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ targetLang: target, keepOriginal: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Translation failed");
      onQueued();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Translation failed");
    } finally {
      setBusy(false);
    }
  }

  if (languages.length === 0) return null;

  return (
    <div className="space-y-2 rounded-xl border border-card-border p-3 bg-panel">
      <div>
        <label className="text-xs font-semibold text-ink">Translate captions</label>
        <p className="text-[10px] text-ink-soft mt-0.5">
          Subtitles in another language — no dubbed voice track needed.
        </p>
      </div>
      <div className="flex gap-2">
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          disabled={disabled || busy}
          className="flex-1 rounded-lg border border-card-border px-2 py-1.5 text-xs bg-panel"
        >
          {languages.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
        <Button size="sm" onClick={() => void translate()} disabled={disabled || busy || !target}>
          {busy ? "Translating…" : "Translate"}
        </Button>
      </div>
      {error && <p className="text-[11px] text-error">{error}</p>}
      <p className="text-[10px] text-ink-soft">
        Your original transcript is kept, so you can switch back without re-transcribing.
      </p>
    </div>
  );
}
