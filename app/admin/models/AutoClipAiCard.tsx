"use client";

// Admin switches for AutoClip's AI B-roll, reframing and keyframing
// (lib/autoclip-ai/config.ts, /api/admin/autoclip-ai). Every feature ships OFF
// except generated B-roll, which replaced stock B-roll; this is where a
// feature is turned on for a tier, watched, and widened.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/app/components/ui/Card";
import { Switch } from "@/app/components/ui/Switch";
import { Checkbox } from "@/app/components/ui/Checkbox";
import { useToast } from "@/app/components/ui/Toast";
import { AI_FEATURES, type AiFeature, type AutoClipAiConfig } from "@/lib/autoclip-ai/config-shared";
import { PLAN_NAME, TIER_ORDER, type TierId } from "@/lib/plans/tiers";

type Keys = Record<"gemini" | "fal" | "gpu", boolean>;

const FEATURE_LABEL: Record<AiFeature, { label: string; hint: string; needs?: keyof Keys }> = {
  editPlan: { label: "AI edit plan", hint: "Gemini plans punch-ins, resets and where B-roll goes, per clip", needs: "gemini" },
  brollGenerateImage: { label: "Generated still B-roll", hint: "AI image with a slow camera move for each B-roll window", needs: "fal" },
  brollGenerateVideo: { label: "Generated video B-roll", hint: "AI video instead of a still; the user must also opt in per run", needs: "fal" },
  shotAwareReframe: { label: "Shot-aware reframing", hint: "Restart the crop at every hard cut" },
  sceneVision: { label: "Scene vision", hint: "Gemini labels each shot: screen, gameplay, product…", needs: "gemini" },
  subjectTrack: { label: "Subject tracking", hint: "SAM 2 follows a non-face subject (needs scene vision)", needs: "gpu" },
  cameraPath: { label: "Camera path solver", hint: "Hold-then-ease camera instead of following every drift" },
  speakerLead: { label: "Speaker lead", hint: "Cut to the next speaker just before they talk" },
};

export function AutoClipAiCard({ headers }: { headers: () => Record<string, string> }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-autoclip-ai"],
    queryFn: async () => {
      const res = await fetch("/api/admin/autoclip-ai", { headers: headers() });
      if (!res.ok) throw new Error("Failed to load AutoClip AI settings");
      return (await res.json()) as { config: AutoClipAiConfig; keys: Keys };
    },
  });
  const save = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const res = await fetch("/api/admin/autoclip-ai", { method: "PATCH", headers: headers(), body: JSON.stringify(patch) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).issues?.[0]?.message ?? "Update failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-autoclip-ai"] }),
    onError: (e: Error) => showToast(e.message, "error"),
  });

  if (!data) return null;
  const { config, keys } = data;
  const missing = (k?: keyof Keys) => (k && !keys[k] ? ` (no ${k === "gpu" ? "GPU service" : `${k} key`} on this server)` : "");

  const toggleTier = (f: AiFeature, t: TierId, on: boolean) => {
    const tiers = on ? [...new Set([...config.features[f].tiers, t])] : config.features[f].tiers.filter((x) => x !== t);
    save.mutate({ features: { [f]: { tiers } } });
  };

  return (
    <Card shadow padding="lg">
      <h2 className="text-base font-bold text-fg mb-1">AutoClip AI: B-roll, reframing and keyframing</h2>
      <p className="text-xs text-fg-subtle mb-4">
        Generated B-roll is on for every plan; every other feature is off until switched on here. Each runs only for the plans ticked. Changes apply to the next run, no deploy.
        Every step is best-effort: if one fails, the clip renders the way it did before.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-fg-subtle">
              <th className="py-2 pr-3 font-semibold">Feature</th>
              <th className="py-2 pr-3 font-semibold">On</th>
              {TIER_ORDER.map((t) => <th key={t} className="py-2 pr-3 font-semibold">{PLAN_NAME[t]}</th>)}
            </tr>
          </thead>
          <tbody>
            {AI_FEATURES.map((f) => (
              <tr key={f} className="border-t border-line">
                <td className="py-2 pr-3">
                  <div className="font-medium text-fg">{FEATURE_LABEL[f].label}</div>
                  <div className="text-[11px] text-fg-subtle">{FEATURE_LABEL[f].hint}{missing(FEATURE_LABEL[f].needs)}</div>
                </td>
                <td className="py-2 pr-3">
                  <Switch
                    checked={config.features[f].enabled}
                    onChange={(on) => save.mutate({ features: { [f]: { enabled: on } } })}
                    label={`${FEATURE_LABEL[f].label} on`}
                  />
                </td>
                {TIER_ORDER.map((t) => (
                  <td key={t} className="py-2 pr-3">
                    <Checkbox
                      checked={config.features[f].tiers.includes(t)}
                      onChange={(on) => toggleTier(f, t, on)}
                      label={`${FEATURE_LABEL[f].label} for ${PLAN_NAME[t]}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="text-sm font-bold text-fg mt-6 mb-2">Generated B-roll</h3>
      <p className="text-xs text-fg-subtle mb-3">
        AutoClip&apos;s only B-roll: an AI still per B-roll window with a slow camera move (push in, pull out or pan).
        Stock footage was removed. Each still is about ${config.unitCostUsd.falImage.toFixed(3)}, inside the run&apos;s cap below.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <NumberField label="Inserts per clip (0-3)" value={config.broll.maxGeneratedPerClip} onSave={(v) => save.mutate({ broll: { maxGeneratedPerClip: v } })} />
      </div>

      <h3 className="text-sm font-bold text-fg mt-6 mb-2">Most a run may spend on AI extras (USD)</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {TIER_ORDER.map((t) => (
          <NumberField
            key={t}
            label={PLAN_NAME[t]}
            step={0.05}
            value={config.costCeilingUsd[t]}
            onSave={(v) => save.mutate({ costCeilingUsd: { [t]: v } })}
          />
        ))}
      </div>
    </Card>
  );
}

function NumberField({ label, value, onSave, step = 1 }: { label: string; value: number; onSave: (v: number) => void; step?: number }) {
  return (
    <div>
      <label className="text-xs font-semibold text-fg-subtle block mb-1">{label}</label>
      <input
        type="number"
        min={0}
        step={step}
        defaultValue={value}
        aria-label={label}
        onBlur={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= 0 && n !== value) onSave(n);
        }}
        className="w-full border border-line rounded-lg px-3 py-2 text-sm"
      />
    </div>
  );
}
