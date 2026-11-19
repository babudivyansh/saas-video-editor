"use client";
import { useEffect, useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { Modal } from "@/app/components/ui/Modal";
import CaptionTemplateGallery, { TemplatePreviewLoop } from "@/app/components/captions/CaptionTemplateGallery";
import { useCaptionTemplates, type PickerTemplate } from "@/app/components/captions/useCaptionTemplates";
import { useUpgradePrompt } from "@/app/components/captions/useUpgradePrompt";
import { clientAuthToken } from "@/lib/client-session";

// A clip's Captions panel: the template gallery, the three tweaks the render
// engine supports on top of a template, and caption translation.

function authHeaders(): Record<string, string> {
  const token = clientAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface CaptionTemplatePickerProps {
  value: string | null;
  onChange: (templateId: string) => void;
  disabled?: boolean;
}

/** How many styles the panel shows before "All styles". */
const QUICK_COUNT = 4;

/**
 * The clip's own style first, then the first unlocked styles of the catalogue.
 * The full gallery (150+, with its family tabs) took the whole panel and
 * pushed every other caption setting out of view, so it opens in its own
 * full-screen dialog instead.
 */
export function quickPickTemplates(templates: PickerTemplate[], value: string | null, count = QUICK_COUNT): PickerTemplate[] {
  const current = templates.find((t) => t.id === value);
  const rest = templates.filter((t) => t.id !== value && !t.locked).slice(0, count - (current ? 1 : 0));
  return current ? [current, ...rest] : rest;
}

export function CaptionTemplatePicker({ value, onChange, disabled }: CaptionTemplatePickerProps) {
  const upgrade = useUpgradePrompt();
  const { templates } = useCaptionTemplates();
  const [allOpen, setAllOpen] = useState(false);
  const quick = quickPickTemplates(templates, value);

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] text-fg-muted">A complete look (type, motion, colour and emoji) in one choice.</p>
      <div className="grid grid-cols-2 gap-2.5">
        {quick.map((t) => {
          const selected = value === t.id;
          return (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              aria-label={t.name}
              title={t.hint}
              onClick={() => (t.locked ? upgrade() : onChange(t.id))}
              className={`relative overflow-hidden rounded-xl bg-surface-2 text-left transition-all disabled:opacity-40 ${
                selected ? "ring-2 ring-emerald-bright" : "ring-1 ring-card-border hover:ring-line-strong"
              }`}
            >
              {/* Short tiles, not 9:16 phones: four of those filled the panel again. */}
              <div style={{ height: 84 }}><TemplatePreviewLoop template={t} fill className="h-full" /></div>
              <span className="block px-2 py-1.5">
                <span className={`block truncate text-[11px] font-semibold ${selected ? "text-fg" : "text-fg-muted"}`}>{t.name}</span>
              </span>
              {selected && (
                <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-bright">
                  <svg className="h-2.5 w-2.5 text-bg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5" aria-hidden="true">
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <Button type="button" variant="secondary" size="sm" className="w-full" onClick={() => setAllOpen(true)} disabled={disabled}>
        {`All ${templates.length} caption styles`}
      </Button>

      <Modal open={allOpen} onClose={() => setAllOpen(false)} title="Caption styles" variant="fullscreen">
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-6 sm:px-8">
          <p className="mb-5 text-center text-sm text-fg-muted">
            Pick a look. It applies to this clip straight away, and you can still change its colour, size and position after.
          </p>
          <CaptionTemplateGallery
            value={value}
            onChange={(id) => { onChange(id); setAllOpen(false); }}
            onLocked={upgrade}
            disabled={disabled}
            columns={5}
            scrollInside={false}
          />
        </div>
      </Modal>
    </div>
  );
}

// ── Tweaks on top of a template ─────────────────────────────────────────────

export interface CaptionTweakControlsProps {
  /** #RRGGBB, or null for the template's own accent. */
  accent: string | null;
  templateAccent: string;
  onAccentChange: (hex: string | null) => void;
  /** 0.7–1.4. */
  sizeScale: number;
  onSizeScaleChange: (v: number) => void;
  /** Block centre, % of frame height (15–85). */
  positionY: number;
  onPositionYChange: (y: number) => void;
  /** How many other clips in the run "Use on all" would copy to (0 hides it). */
  otherClipCount?: number;
  /** One click: copy this style to the run's other clips. */
  onApplyToAll?: () => void;
  applyToAllState?: "idle" | "saving" | "done" | "error";
  disabled?: boolean;
}

/** Accent colour, size and position: the only things a clip changes about its template. */
export function CaptionTweakControls({
  accent, templateAccent, onAccentChange,
  sizeScale, onSizeScaleChange,
  positionY, onPositionYChange,
  otherClipCount = 0, onApplyToAll, applyToAllState = "idle",
  disabled,
}: CaptionTweakControlsProps) {
  const shown = (accent ?? templateAccent).slice(0, 7);
  return (
    <div className="space-y-3 rounded-xl border border-card-border bg-panel p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <label htmlFor="caption-accent" className="text-xs font-semibold text-ink">Accent colour</label>
          <p className="text-[10px] text-ink-soft mt-0.5">The spoken word&apos;s colour.</p>
        </div>
        <div className="flex items-center gap-2">
          {accent && (
            <button type="button" onClick={() => onAccentChange(null)} disabled={disabled} className="text-[10px] font-semibold text-ink-soft hover:text-ink">
              Reset
            </button>
          )}
          <input
            id="caption-accent"
            type="color"
            value={shown}
            disabled={disabled}
            onChange={(e) => onAccentChange(e.target.value.toUpperCase())}
            className="h-7 w-10 cursor-pointer rounded border border-card-border bg-panel-raised"
          />
        </div>
      </div>

      <div className="border-t border-card-border pt-3">
        <label htmlFor="caption-size" className="text-xs font-semibold text-ink">Size</label>
        <input
          id="caption-size"
          type="range"
          min={70}
          max={140}
          step={5}
          value={Math.round(sizeScale * 100)}
          disabled={disabled}
          onChange={(e) => onSizeScaleChange(Number(e.target.value) / 100)}
          className="mt-1.5 w-full accent-brand"
        />
        <div className="flex justify-between text-[9px] text-ink-soft">
          <span>Smaller</span>
          <span>{Math.round(sizeScale * 100)}%</span>
          <span>Bigger</span>
        </div>
      </div>

      <div className="border-t border-card-border pt-3">
        <label htmlFor="caption-position-y" className="text-xs font-semibold text-ink">Position</label>
        <p className="text-[10px] text-ink-soft mt-0.5">
          Keep captions clear of the speaker&apos;s face. They never go below the area platforms cover with buttons.
        </p>
        <input
          id="caption-position-y"
          type="range"
          min={15}
          max={80}
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

      {onApplyToAll && otherClipCount > 0 && (
        <div className="border-t border-card-border pt-3">
          {/* One click. This was a switch that did nothing until a separate
              "Apply caption style" button was pressed. */}
          <button
            type="button"
            onClick={onApplyToAll}
            disabled={disabled || applyToAllState === "saving"}
            className="w-full rounded-lg border border-card-border bg-panel px-3 py-2 text-xs font-semibold text-ink hover:bg-tint-blue disabled:opacity-50"
          >
            {applyToAllState === "saving"
              ? "Copying…"
              : applyToAllState === "done"
                ? `✓ Style copied to ${otherClipCount} other clip${otherClipCount === 1 ? "" : "s"}`
                : `Use this style on the other ${otherClipCount} clip${otherClipCount === 1 ? "" : "s"}`}
          </button>
          <p className="text-[10px] text-ink-soft mt-1">
            {applyToAllState === "error"
              ? "Couldn't copy the style to every clip — try again."
              : "Saves the style on them without re-rendering, so it costs nothing now. Each shows it after its next re-render."}
          </p>
        </div>
      )}
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
