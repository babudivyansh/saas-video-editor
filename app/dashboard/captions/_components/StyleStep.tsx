"use client";

// Caption Studio, step 4: one look for every caption — font, size, case,
// colours, outline, words on screen, position, motion — previewed in this
// frame and two others at once, so a change is judged in every shape it will
// export in. The look can be saved as "My template" and reused.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CAPTION_STYLE_FONTS,
  effectiveCaptionTemplate,
  type CaptionStyleOverride,
} from "@clipiro/shared/caption-style";
import { CAPTION_MOTIONS } from "@clipiro/shared/caption-templates";
import { Switch } from "@/app/components/ui/Switch";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { clientAuthToken } from "@/lib/client-session";
import { docDimensions, type Aspect, type TimelineDoc } from "@/lib/editor/types";
import { currentTemplateId, SAFE_ZONES, withTemplate } from "@/lib/captions/studio";
import type { SavedCaptionTemplate } from "@/lib/captions/user-templates";
import { StudioPreview } from "./StudioPreview";
import type { StudioProject } from "./useStudioProject";

const authHeaders = (): Record<string, string> => {
  const token = clientAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/** Two other shapes to preview beside the project's own. */
function otherShapes(aspect: Aspect): Aspect[] {
  return (["9:16", "1:1", "16:9"] as Aspect[]).filter((a) => a !== aspect).slice(0, 2);
}

/** Motion ids that don't read as words; the rest are capitalised as they are. */
const MOTION_NAMES: Record<string, string> = {
  pops: "Soft pop", color: "Colour swap", dim: "Dim others", boxword: "Word box", stack: "Build up", emph: "Emphasis",
  typestep: "Typewriter", type: "Write on", rgb: "RGB split", fontswitch: "Font switch", split: "Split tone",
  tiltswap: "Tilt swap", slidel: "Slide in", extrude: "3D extrude", tada: "Ta-da", swipe: "Swipe up",
  stretch: "Stretch in", draw: "Outline to fill", roll: "Slot roll", ink: "Ink bloom", wave: "Letter wave",
  cascade: "Letter cascade", rainbow: "Rainbow letters", scramble: "Decoder", slice: "Glitch slice",
};
const MOTION_LABEL = (m: string) => MOTION_NAMES[m] ?? m.charAt(0).toUpperCase() + m.slice(1);

/** The caption outline a width turns on when the template has none (caption data, not page colour). */
const DEFAULT_OUTLINE = "#000000";

export interface StyleStepProps {
  project: StudioProject;
  save: (change: (doc: TimelineDoc) => TimelineDoc) => Promise<unknown>;
}

export function StyleStep({ project, save }: StyleStepProps) {
  const { doc } = project;
  const [style, setStyle] = useState<CaptionStyleOverride>(doc.captionStyle ?? {});
  const [zone, setZone] = useState<keyof typeof SAFE_ZONES>("reels");
  const [saved, setSaved] = useState<SavedCaptionTemplate[]>([]);
  const [limit, setLimit] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [deleting, setDeleting] = useState<SavedCaptionTemplate | null>(null);

  // The look applies at once in the previews and is saved after a pause, so
  // dragging a slider isn't a save per pixel.
  const pending = useRef<number | null>(null);
  const update = (patch: Partial<CaptionStyleOverride>) => {
    const next = { ...style, ...patch };
    for (const k of Object.keys(next) as (keyof CaptionStyleOverride)[]) if (next[k] === undefined) delete next[k];
    setStyle(next);
    if (pending.current) window.clearTimeout(pending.current);
    pending.current = window.setTimeout(() => {
      void save((d) => {
        if (Object.keys(next).length) return { ...d, captionStyle: next };
        const { captionStyle: _drop, ...rest } = d;
        return rest as TimelineDoc;
      });
    }, 500);
  };
  useEffect(() => () => { if (pending.current) window.clearTimeout(pending.current); }, []);

  useEffect(() => {
    fetch("/api/caption-templates/mine", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setSaved(d.templates ?? []); setLimit(d.limit ?? null); } })
      .catch(() => {});
  }, []);

  const previewDoc: TimelineDoc = useMemo(() => ({ ...doc, captionStyle: style }), [doc, style]);
  const templateId = currentTemplateId(doc) ?? project.startTemplateId;
  const frame = docDimensions(doc);
  const resolved = effectiveCaptionTemplate(templateId, style, frame);
  const base = effectiveCaptionTemplate(templateId, null, frame).template;
  const tall = frame.h > frame.w;
  const z = SAFE_ZONES[zone];

  const saveAsTemplate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setMessage(null);
    const res = await fetch("/api/caption-templates/mine", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name: name.trim(), baseTemplateId: templateId, style, isDefault: makeDefault }),
    }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    setSaving(false);
    if (!res?.ok) { setMessage({ ok: false, text: body?.message ?? body?.error ?? "Couldn't save this look." }); return; }
    setSaved((list) => [body.template, ...list.map((t) => (makeDefault ? { ...t, isDefault: false } : t))]);
    setName("");
    setMessage({ ok: true, text: `Saved “${body.template.name}”.` });
  };

  const applySaved = (t: SavedCaptionTemplate) => {
    setStyle(t.style);
    void save((d) => ({ ...withTemplate(d, t.baseTemplateId), captionStyle: t.style }));
  };
  const removeSaved = async (t: SavedCaptionTemplate) => {
    const res = await fetch(`/api/caption-templates/mine/${t.id}`, { method: "DELETE", headers: authHeaders() }).catch(() => null);
    if (res?.ok) setSaved((list) => list.filter((x) => x.id !== t.id));
  };

  const field = "h-[42px] rounded-xl border border-line-strong bg-surface-3 px-2.5 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary/70";
  const label = "flex flex-col gap-1.5 text-[13px] font-semibold text-fg-muted";

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)_330px]">
      {/* Controls */}
      <section aria-labelledby="cs-style" className="flex flex-col gap-5 overflow-y-auto border-line bg-surface-1 p-5 lg:border-r">
        <div className="flex items-center justify-between">
          <h1 id="cs-style" className="text-lg font-extrabold">Style</h1>
          <button type="button" onClick={() => update({ font: undefined, weight: undefined, case: undefined, size: undefined, base: undefined, accent: undefined, outline: undefined, outlineWidth: undefined, words: undefined, positionY: undefined, motion: undefined })} disabled={!Object.keys(style).length} className="text-xs font-semibold text-fg-muted hover:text-fg disabled:opacity-40">Reset to template</button>
        </div>

        <div className="grid grid-cols-[1fr_110px] gap-2.5">
          <label className={label}>Font
            <select value={style.font ?? ""} onChange={(e) => update({ font: e.target.value || undefined })} className={field}>
              <option value="">Template ({base.type.font})</option>
              {CAPTION_STYLE_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label className={label}>Weight
            <select value={style.weight ?? ""} onChange={(e) => update({ weight: e.target.value ? Number(e.target.value) : undefined })} className={field}>
              <option value="">{base.type.weight}</option>
              {[400, 500, 600, 700, 800, 900].map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </label>
        </div>

        <label className={label}>
          <span className="flex justify-between">Size <span className="font-mono text-fg">{Math.round((style.size ?? 1) * 100)}%</span></span>
          <input type="range" min={0.5} max={2} step={0.05} value={style.size ?? 1} onChange={(e) => update({ size: Number(e.target.value) === 1 ? undefined : Number(e.target.value) })} className="accent-[var(--emerald-bright)]" />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[13px] font-semibold text-fg-muted">Case</legend>
          <div className="grid grid-cols-3 rounded-xl bg-surface-3 p-1 text-sm font-bold">
            {(["upper", "none", "lower"] as const).map((c) => {
              const on = (style.case ?? base.type.case) === c;
              return (
                <button key={c} type="button" aria-pressed={on} onClick={() => update({ case: c === base.type.case ? undefined : c })} className={`rounded-[9px] py-2 ${on ? "bg-fg text-bg" : "text-fg-muted"}`}>
                  {c === "upper" ? "AA" : c === "lower" ? "aa" : "Aa"}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2 text-[13px] font-semibold text-fg-muted">Colours</legend>
          {([
            ["base", "Text", resolved.template.colors.base],
            ["accent", "Spoken word", resolved.template.colors.accent],
            ["outline", "Outline", resolved.template.colors.outline ?? "#000000"],
          ] as const).map(([key, text, value]) => (
            <label key={key} className="flex items-center justify-between rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm">
              <span>{text}</span>
              <span className="flex items-center gap-2 font-mono text-xs text-fg-muted">
                {value.slice(0, 7).toUpperCase()}
                <input type="color" aria-label={`${text} colour`} value={value.slice(0, 7)} onChange={(e) => update({ [key]: e.target.value.toUpperCase() })} className="h-6 w-6 cursor-pointer rounded-md border border-line-strong bg-transparent" />
              </span>
            </label>
          ))}
          <label className={label}>
            <span className="flex justify-between">Outline width <span className="font-mono text-fg">{(style.outlineWidth ?? resolved.template.colors.outlineWidth ?? 0).toFixed(1)}</span></span>
            <input type="range" min={0} max={4} step={0.5} value={style.outlineWidth ?? resolved.template.colors.outlineWidth ?? 0} onChange={(e) => update({ outlineWidth: Number(e.target.value), ...(Number(e.target.value) > 0 && !resolved.template.colors.outline ? { outline: DEFAULT_OUTLINE } : {}) })} className="accent-[var(--emerald-bright)]" />
          </label>
        </fieldset>

        <div className="grid grid-cols-2 gap-2.5">
          <label className={label}>Words on screen
            <select value={style.words ?? ""} onChange={(e) => update({ words: e.target.value ? Number(e.target.value) : undefined })} className={field}>
              <option value="">Auto ({resolved.template.words})</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className={label}>Motion
            <select value={style.motion ?? ""} onChange={(e) => update({ motion: (e.target.value || undefined) as CaptionStyleOverride["motion"] })} className={field}>
              <option value="">Template ({MOTION_LABEL(base.motion)})</option>
              {CAPTION_MOTIONS.map((m) => <option key={m} value={m}>{MOTION_LABEL(m)}</option>)}
            </select>
          </label>
        </div>

        <label className={label}>
          <span className="flex justify-between">Position <span className="font-mono text-fg">{style.positionY != null ? `${Math.round(style.positionY)}% down` : "Template"}</span></span>
          <input type="range" min={5} max={95} step={1} value={style.positionY ?? 70} onChange={(e) => update({ positionY: Number(e.target.value) })} className="accent-[var(--emerald-bright)]" />
          {style.positionY != null && <button type="button" onClick={() => update({ positionY: undefined })} className="self-start text-xs font-semibold text-fg-muted hover:text-fg">Use the template&apos;s position</button>}
        </label>
      </section>

      {/* Previews */}
      <main className="flex min-w-0 flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold">One style, every shape</h2>
          {tall && (
            <label className="flex items-center gap-2 text-[13px] text-fg-muted">
              Safe zones
              <select value={zone} onChange={(e) => setZone(e.target.value as keyof typeof SAFE_ZONES)} className="h-[34px] rounded-[10px] border border-line-strong bg-surface-3 px-2 text-[13px] text-fg">
                {Object.entries(SAFE_ZONES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-center gap-7">
          <figure className="flex flex-col items-center gap-2.5">
            <StudioPreview doc={previewDoc} media={project.media} maxWidth={300} maxHeight={480}>
              {tall && (
                <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                  <div className="absolute inset-x-0 top-0 border-b border-dashed border-error/60 bg-error/15" style={{ height: `${z.top * 100}%` }} />
                  <div className="absolute inset-x-0 bottom-0 border-t border-dashed border-error/60 bg-error/15" style={{ height: `${z.bottom * 100}%` }} />
                  <div className="absolute right-0 border-l border-dashed border-error/60 bg-error/15" style={{ width: `${z.right * 100}%`, top: `${z.rightFrom * 100}%`, height: `${(z.rightTo - z.rightFrom) * 100}%` }} />
                </div>
              )}
            </StudioPreview>
            <figcaption className="font-mono text-xs text-fg-muted">{doc.aspect === "original" ? "Original" : doc.aspect} · this project</figcaption>
          </figure>
          <div className="flex flex-col gap-5">
            {otherShapes(doc.aspect).map((a) => (
              <figure key={a} className="flex flex-col items-center gap-2.5">
                <StudioPreview doc={{ ...previewDoc, aspect: a }} media={project.media} maxWidth={320} maxHeight={200} />
                <figcaption className="font-mono text-xs text-fg-muted">{a} · fitted for this shape</figcaption>
              </figure>
            ))}
          </div>
        </div>
        {tall && <p className="text-xs text-fg-subtle">Red areas are roughly where {z.label} draws its own buttons and caption. Keep your captions out of them.</p>}
      </main>

      {/* Save */}
      <aside aria-label="Save template" className="flex flex-col gap-5 border-line bg-surface-1 p-5 lg:border-l">
        <div className="flex flex-col gap-3.5 rounded-[18px] border border-emerald-bright/30 bg-surface-2 p-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] font-extrabold">Save as my template</h2>
            <p className="text-[13px] leading-relaxed text-fg-muted">Reuse this exact look on every video. Word edits stay with this project.</p>
          </div>
          <label className={label}>Name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Founder bold — lime" className={field} />
          </label>
          <div className="flex items-center justify-between text-[13px]">
            <span>Default for new projects</span>
            <Switch checked={makeDefault} onChange={setMakeDefault} label="Default for new projects" />
          </div>
          <button type="button" onClick={() => void saveAsTemplate()} disabled={!name.trim() || saving} className="h-11 rounded-xl bg-primary text-sm font-bold text-on-primary hover:bg-primary-hover disabled:opacity-40">
            {saving ? "Saving…" : "Save template"}
          </button>
          {message && <p role="status" className={`text-xs ${message.ok ? "text-success" : "text-error"}`}>{message.text}</p>}
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-xs uppercase tracking-[0.08em] text-fg-subtle">My templates</h3>
            {limit != null && <span className="text-xs text-fg-subtle">{saved.length} of {limit}</span>}
          </div>
          {saved.length === 0 && <p className="text-[13px] text-fg-subtle">Nothing saved yet.</p>}
          {saved.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-[14px] border border-line bg-surface-3 p-2.5">
              <button type="button" onClick={() => applySaved(t)} className="flex min-w-0 flex-1 flex-col items-start text-left">
                <span className="truncate text-sm font-bold">{t.name}</span>
                <span className="text-xs text-fg-subtle">{t.isDefault ? "Default · " : ""}Apply to this project</span>
              </button>
              <button type="button" onClick={() => setDeleting(t)} aria-label={`Delete ${t.name}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-fg-subtle hover:bg-error/10 hover:text-error">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
              </button>
            </div>
          ))}
        </div>
      </aside>
      <ConfirmDialog
        open={!!deleting}
        title="Delete this saved look?"
        message={deleting ? `“${deleting.name}” will be removed from My templates. Projects already using it keep their captions.` : ""}
        confirmLabel="Delete"
        danger
        onConfirm={async () => { if (deleting) await removeSaved(deleting); setDeleting(null); }}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
