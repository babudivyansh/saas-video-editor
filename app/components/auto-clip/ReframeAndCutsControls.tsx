// Shared "Smart Auto Reframe" + "Smart Audio Trimming" control blocks, used by
// both the auto-clip Step 2 settings form and the per-clip editor drawer's
// Cuts tab — previously two ~150-line copy-pasted JSX blocks with duplicated
// state, kept here as one component so the two surfaces can't drift again.
import { Switch } from "@/app/components/ui/Switch";
import { ALL_LAYOUT_TEMPLATES, type SpeakerMode } from "@/lib/speaker-modes";
import type { ZoomStyle } from "@/lib/zoom-style";

export type ZoomStrength = "low" | "medium" | "high";

export const REFRAME_PRESETS = [
  { value: "balanced", label: "Balanced" },
  { value: "minimal", label: "Minimal" },
  { value: "dynamic", label: "Dynamic" },
  { value: "cinematic", label: "Cinematic" },
] as const;

export const ZOOM_STRENGTHS: { value: ZoomStrength; label: string }[] = [
  { value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" },
];

export const ZOOM_STYLE_OPTIONS: { value: ZoomStyle; label: string; hint: string }[] = [
  { value: "jump", label: "Jump", hint: "Snaps in and out on new sentences and key words" },
  { value: "smooth", label: "Smooth", hint: "Slow push-ins when the delivery gets louder" },
];

export const SPEAKER_MODES: { value: SpeakerMode; label: string }[] =
  ALL_LAYOUT_TEMPLATES.map((t) => ({ value: t.mode, label: t.label }));

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-1.5 text-center text-xs font-bold transition-colors ${
        active ? "grad-brand text-on-primary shadow-glow border-transparent" : "bg-panel border-card-border text-ink-soft hover:bg-tint-blue hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Slider({ label, value, onChange, min, max, step, suffix }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; suffix: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-ink-soft">
        <span>{label}</span>
        <span className="font-bold text-ink">{value}{suffix}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step}
        value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 bg-card-border rounded-lg appearance-none cursor-pointer accent-brand"
      />
    </div>
  );
}

export interface ReframeAndCutsValues {
  smartAutoReframe: boolean;
  reframingPreset: string;
  zoomStrength: ZoomStrength;
  speakerMode: SpeakerMode;
  smoothness: number;
  trackingSpeed: number;
  removeSilence: boolean;
  silenceThresholdMs: number;
  removeFillers: boolean;
}

export interface ReframeAndCutsSetters {
  setSmartAutoReframe: (v: boolean) => void;
  setReframingPreset: (v: string) => void;
  setZoomStrength: (v: ZoomStrength) => void;
  setSpeakerMode: (v: SpeakerMode) => void;
  setSmoothness: (v: number) => void;
  setTrackingSpeed: (v: number) => void;
  setRemoveSilence: (v: boolean) => void;
  setSilenceThresholdMs: (v: number) => void;
  setRemoveFillers: (v: boolean) => void;
  /** The create flow picks the layout on its own step, so it hides the chips here. */
  hideSpeakerMode?: boolean;
  /** Optional: only surfaces that store a zoom style pass these. */
  zoomStyle?: ZoomStyle;
  setZoomStyle?: (v: ZoomStyle) => void;
}

export function ReframeAndCutsControls(props: ReframeAndCutsValues & ReframeAndCutsSetters) {
  const {
    smartAutoReframe, setSmartAutoReframe, reframingPreset, setReframingPreset,
    zoomStrength, setZoomStrength, speakerMode, setSpeakerMode,
    smoothness, setSmoothness, trackingSpeed, setTrackingSpeed,
    removeSilence, setRemoveSilence, silenceThresholdMs, setSilenceThresholdMs,
    removeFillers, setRemoveFillers, zoomStyle, setZoomStyle, hideSpeakerMode,
  } = props;

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-xl border border-card-border bg-tint-blue/40 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink mb-0.5">Smart Auto Reframe</h3>
            <p className="text-xs text-ink-soft font-medium">Automatically center, smooth reframe, and zoom landscape video.</p>
          </div>
          <Switch checked={smartAutoReframe} onChange={setSmartAutoReframe} label="Smart Auto Reframe" />
        </div>

        {smartAutoReframe && (
          <div className="space-y-4 pt-4 border-t border-card-border">
            <div className="space-y-2">
              <label className="text-xs font-bold text-ink-soft uppercase tracking-wider block">Camera Motion</label>
              <div className="grid grid-cols-4 gap-2">
                {REFRAME_PRESETS.map((p) => (
                  <Chip key={p.value} active={reframingPreset === p.value} onClick={() => setReframingPreset(p.value)}>{p.label}</Chip>
                ))}
              </div>
            </div>

            {zoomStyle && setZoomStyle && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-ink-soft uppercase tracking-wider block">Zoom Style</label>
                <div className="grid grid-cols-2 gap-2">
                  {ZOOM_STYLE_OPTIONS.map((z) => (
                    <Chip key={z.value} active={zoomStyle === z.value} onClick={() => setZoomStyle(z.value)}>{z.label}</Chip>
                  ))}
                </div>
                <p className="text-[11px] text-ink-soft">{ZOOM_STYLE_OPTIONS.find((z) => z.value === zoomStyle)?.hint}</p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-ink-soft uppercase tracking-wider block">Zoom Strength</label>
              <div className="grid grid-cols-3 gap-2">
                {ZOOM_STRENGTHS.map((z) => (
                  <Chip key={z.value} active={zoomStrength === z.value} onClick={() => setZoomStrength(z.value)}>{z.label}</Chip>
                ))}
              </div>
            </div>

            {!hideSpeakerMode && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-ink-soft uppercase tracking-wider block">Layout</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {SPEAKER_MODES.map((s) => (
                    <Chip key={s.value} active={speakerMode === s.value} onClick={() => setSpeakerMode(s.value)}>{s.label}</Chip>
                  ))}
                </div>
              </div>
            )}

            <Slider label="Smoothness" value={smoothness} onChange={setSmoothness} min={0} max={100} step={5} suffix="%" />
            <Slider label="Tracking Speed" value={trackingSpeed} onChange={setTrackingSpeed} min={0} max={100} step={5} suffix="%" />
          </div>
        )}
      </div>

      <div className="space-y-4 rounded-xl border border-card-border bg-tint-blue/40 p-4">
        <div>
          <h3 className="text-sm font-semibold text-ink mb-0.5">Smart Audio Trimming</h3>
          <p className="text-xs text-ink-soft font-medium">Remove empty pauses and filler words automatically.</p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <label className="text-xs font-semibold text-ink block">Remove Silences</label>
            <span className="text-[11px] text-ink-soft block mt-0.5">Cuts silent gaps larger than threshold.</span>
          </div>
          <Switch checked={removeSilence} onChange={setRemoveSilence} label="Remove Silences" />
        </div>

        {removeSilence && (
          <Slider label="Silence Threshold" value={silenceThresholdMs} onChange={setSilenceThresholdMs} min={200} max={1000} step={50} suffix="ms" />
        )}

        <div className="h-px bg-card-border" />

        <div className="flex items-center justify-between">
          <div>
            <label className="text-xs font-semibold text-ink block">Remove Filler Words</label>
            <span className="text-[11px] text-ink-soft block mt-0.5">Cuts words like &quot;um&quot;, &quot;uh&quot;, &quot;like&quot;, etc.</span>
          </div>
          <Switch checked={removeFillers} onChange={setRemoveFillers} label="Remove Filler Words" />
        </div>
      </div>
    </div>
  );
}
