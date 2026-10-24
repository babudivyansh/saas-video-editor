"use client";
import { useEffect, useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { Switch } from "@/app/components/ui/Switch";
import CaptionTemplateGallery from "@/app/components/captions/CaptionTemplateGallery";
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

export function CaptionTemplatePicker({ value, onChange, disabled }: CaptionTemplatePickerProps) {
  const upgrade = useUpgradePrompt();
  return (
    <div className="space-y-2.5">
      <div>
        <label className="text-xs font-semibold text-ink">Caption style</label>
        <p className="text-[10px] text-ink-soft mt-0.5">
          A complete look (type, motion, colour and emoji) in one choice.
        </p>
      </div>
      <CaptionTemplateGallery value={value} onChange={onChange} onLocked={upgrade} disabled={disabled} columns={3} maxHeightClass="max-h-[380px]" />
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
  applyToAll: boolean;
  onApplyToAllChange: (on: boolean) => void;
  disabled?: boolean;
}

/** Accent colour, size and position: the only things a clip changes about its template. */
export function CaptionTweakControls({
  accent, templateAccent, onAccentChange,
  sizeScale, onSizeScaleChange,
  positionY, onPositionYChange,
  applyToAll, onApplyToAllChange,
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

      <div className="border-t border-card-border pt-3">
        <Switch
          checked={applyToAll}
          onChange={onApplyToAllChange}
          label="Apply this style to every clip in this run"
          disabled={disabled}
        />
        <p className="text-[10px] text-ink-soft mt-1">
          Saves this style on the other clips without re-rendering them, so it costs nothing now.
          Each one shows the new style after its next re-render.
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
