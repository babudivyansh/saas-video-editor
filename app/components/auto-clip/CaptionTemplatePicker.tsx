"use client";
import { useEffect, useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { CAPTION_TEMPLATES } from "@/lib/caption-templates";

// Caption templates + translation, as controls rather than API surface.
//
// lib/caption-templates.ts is plain data with no server imports, so it's safe
// to read directly from a client component — the same reason lib/languages.ts
// is kept dependency-free.

export interface CaptionTemplatePickerProps {
  value: string | null;
  onChange: (templateId: string) => void;
  disabled?: boolean;
}

export function CaptionTemplatePicker({ value, onChange, disabled }: CaptionTemplatePickerProps) {
  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs font-semibold text-ink">Caption template</label>
        <p className="text-[10px] text-ink-soft mt-0.5">
          A complete look — typography, keyword colour and emoji — in one choice.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {CAPTION_TEMPLATES.map((t) => {
          const selected = value === t.id;
          return (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(t.id)}
              className={`rounded-xl border p-2.5 text-left transition-colors disabled:opacity-40 ${
                selected ? "border-brand bg-tint-blue" : "border-card-border bg-panel hover:bg-tint-blue/50"
              }`}
            >
              <span className="flex items-center justify-between gap-1">
                <span className="text-xs font-bold text-ink">{t.label}</span>
                {t.emoji && <span className="text-[9px]" title="Places emoji automatically">😀</span>}
              </span>
              <span className="text-[10px] text-ink-soft block mt-0.5 leading-tight">{t.hint}</span>
            </button>
          );
        })}
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

  const authHeaders = (): Record<string, string> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  useEffect(() => {
    fetch(`/api/projects/${projectId}/clips/${clipId}/translate`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => {
        setLanguages(d.languages ?? []);
        if (d.languages?.[0]) setTarget(d.languages[0].code);
      })
      .catch(() => { /* the control simply stays empty */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
