"use client";

// "How credits work": the usage calculator and the per-tool cost list, merged
// into one tabbed section. They answer the same question — how far does a
// plan's allowance go — and as two stacked sections they doubled the page's
// length for it.

import { useState } from "react";
import { Tabs } from "@/app/components/ui/Tabs";
import { PURCHASABLE_TIER_ORDER, TIER_LABEL, SUBSCRIPTION_ROLLOVER_CAP_MULTIPLIER, type TierId } from "@/lib/plans/tiers";
import { IMAGE_MODELS, getImageModel } from "@/lib/models/imageModels";
import { VIDEO_MODELS, getVideoModel, videoCreditsPerSecond } from "@/lib/models/videoModels";
import type { DbPlan, ToolCost } from "./types";

interface CalcSelection {
  kind: "image" | "video";
  modelId: string;
  qty: number;
}

interface CalcResult {
  totalCredits: number;
  eligibleTiers: Exclude<TierId, "free">[];
  recommendedPlan: DbPlan | null;
}

export function computeRecommendation(selections: CalcSelection[], subs: DbPlan[], term: number): CalcResult {
  const active = selections.filter(s => s.qty > 0);
  const totalCredits = active.reduce((sum, s) => {
    if (s.kind === "image") return sum + getImageModel(s.modelId).creditCost * s.qty;
    const m = getVideoModel(s.modelId);
    const dur = typeof m.defaultValues.duration === "number" ? m.defaultValues.duration : m.minDurationSeconds;
    // videoCreditsPerSecond, not the flat base rate: Veo 3 DEFAULTS to audio on
    // (16 cr/s, not 10) and Seedance to 720p, so the bare creditsPerSecond
    // under-quoted the estimate by ~38% on the model most people pick first.
    const perSecond = videoCreditsPerSecond(m, {
      resolution: m.defaultValues.resolution as string | undefined,
      audio: m.defaultValues.audio === "on",
    });
    return sum + perSecond * dur * s.qty;
  }, 0);

  const requiredTierSets = active.map(s =>
    (s.kind === "image" ? getImageModel(s.modelId) : getVideoModel(s.modelId)).allowedTiers
  );
  const eligibleTiers = PURCHASABLE_TIER_ORDER.filter(t => requiredTierSets.every(allowed => allowed.includes(t)));
  const recommendedPlan = eligibleTiers
    .map(t => subs.find(p => p.tier === t && p.intervalMonths === term))
    .find((p): p is DbPlan => !!p && (p.monthlyCredits ?? 0) >= totalCredits) ?? null;

  return { totalCredits, eligibleTiers, recommendedPlan };
}

const selectClass =
  "min-h-11 rounded-[var(--radius-field)] border border-line-strong bg-bg px-3 text-sm font-medium text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary";

function Stepper({ value, onChange, onStep, label }: {
  value: number;
  onChange: (n: number) => void;
  /** Relative change, applied to the latest state so rapid clicks all count. */
  onStep: (delta: number) => void;
  label: string;
}) {
  const btn = "flex h-9 w-9 items-center justify-center rounded-full text-lg text-fg hover:bg-panel-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  return (
    <div className="flex items-center gap-1 rounded-full bg-surface-3 p-1">
      <button type="button" aria-label={`Fewer ${label}`} onClick={() => onStep(-1)} className={btn}>−</button>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        aria-label={`${label} per month`}
        value={value}
        onChange={e => onChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
        className="w-12 bg-transparent text-center text-sm font-semibold tabular-nums text-fg [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button type="button" aria-label={`More ${label}`} onClick={() => onStep(1)} className={btn}>+</button>
    </div>
  );
}

function Calculator({ subs, term, onChoose }: { subs: DbPlan[]; term: number; onChoose: (plan: DbPlan) => void }) {
  const [rows, setRows] = useState<CalcSelection[]>([
    { kind: "image", modelId: IMAGE_MODELS[0].id, qty: 20 },
    { kind: "video", modelId: VIDEO_MODELS[VIDEO_MODELS.length - 1].id, qty: 4 },
  ]);
  const result = computeRecommendation(rows, subs, term);
  const anyQty = rows.some(s => s.qty > 0);

  const update = (idx: number, patch: Partial<CalcSelection>) => {
    setRows(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      const next = { ...s, ...patch };
      // Switching kind means the previously-selected modelId is invalid — reset to that kind's first model.
      if (patch.kind && patch.kind !== s.kind) {
        next.modelId = (patch.kind === "image" ? IMAGE_MODELS[0] : VIDEO_MODELS[0]).id;
      }
      return next;
    }));
  };

  return (
    <div className="flex flex-col gap-3">
      {rows.map((sel, idx) => {
        const models = sel.kind === "image" ? IMAGE_MODELS : VIDEO_MODELS;
        return (
          <div key={idx} className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface-2 p-3 sm:flex-nowrap">
            <select
              aria-label="Type"
              value={sel.kind}
              onChange={e => update(idx, { kind: e.target.value as "image" | "video" })}
              className={selectClass}
            >
              <option value="image">Images</option>
              <option value="video">Videos</option>
            </select>
            <select
              aria-label="Model"
              value={sel.modelId}
              onChange={e => update(idx, { modelId: e.target.value })}
              className={`${selectClass} min-w-0 flex-1`}
            >
              {models.map(m => <option key={m.id} value={m.id}>{m.displayName}</option>)}
            </select>
            <Stepper
              value={sel.qty}
              label={sel.kind === "image" ? "images" : "videos"}
              onChange={qty => update(idx, { qty })}
              onStep={d => setRows(prev => prev.map((s, i) => (i === idx ? { ...s, qty: Math.max(0, s.qty + d) } : s)))}
            />
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => setRows(prev => prev.filter((_, i) => i !== idx))}
                aria-label="Remove row"
                className="flex h-9 w-9 items-center justify-center rounded-full text-fg-subtle hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => setRows(prev => [...prev, { kind: "image", modelId: IMAGE_MODELS[0].id, qty: 0 }])}
        className="self-start py-2 text-sm font-medium text-primary hover:text-primary-hover"
      >
        + Add another model
      </button>

      <div
        aria-live="polite"
        className="flex flex-col gap-4 rounded-2xl bg-surface-3 p-5 ring-1 ring-inset ring-[color-mix(in_oklab,var(--primary)_22%,transparent)] sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex flex-col gap-1">
          <span className="text-[13px] text-fg-muted">Estimated monthly usage</span>
          <span className="text-3xl font-semibold tabular-nums tracking-tight text-fg">
            {result.totalCredits.toLocaleString("en-IN")} credits
          </span>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          {result.recommendedPlan ? (
            <>
              <span className="text-sm text-fg">
                {TIER_LABEL[result.recommendedPlan.tier!]} covers this ({result.recommendedPlan.monthlyCredits} credits/month)
              </span>
              <button
                type="button"
                onClick={() => onChoose(result.recommendedPlan!)}
                className="min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-on-primary hover:bg-primary-hover"
              >
                Choose {TIER_LABEL[result.recommendedPlan.tier!]}
              </button>
            </>
          ) : result.eligibleTiers.length === 0 && anyQty ? (
            <span className="max-w-xs text-sm text-warning sm:text-right">
              No single plan unlocks every model you picked. Choose the highest tier any of them needs.
            </span>
          ) : anyQty ? (
            <span className="max-w-xs text-sm text-warning sm:text-right">
              More than Studio&apos;s monthly allowance. Add a top-up pack alongside your plan.
            </span>
          ) : (
            <span className="text-sm text-fg-muted">Add a model and a quantity to see an estimate.</span>
          )}
        </div>
      </div>
    </div>
  );
}

function costLabel(t: ToolCost) {
  if (t.creditCostMin != null && t.creditCostMax != null && t.creditCostMax > t.creditCostMin) {
    return `${t.creditCostMin}–${t.creditCostMax} credits`;
  }
  if (t.creditCost === 0) return "Free";
  return `${t.creditCost} ${t.creditCost === 1 ? "credit" : "credits"}`;
}

function CostList({ toolCosts }: { toolCosts: ToolCost[] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? toolCosts : toolCosts.slice(0, 8);
  return (
    <div className="flex flex-col">
      <ul>
        {shown.map(t => {
          const free = t.creditCost === 0 && t.creditCostMax == null;
          return (
            <li key={t.slug} className="flex items-center justify-between gap-3 border-b border-line py-3.5">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium text-fg">{t.label}</p>
                {t.service && <p className="truncate text-xs text-fg-subtle">{t.service}</p>}
              </div>
              <span className={`flex-shrink-0 rounded-full px-2.5 py-1 font-mono text-xs font-medium ${
                free ? "bg-tint-emerald text-success" : "bg-surface-3 text-fg"
              }`}>
                {costLabel(t)}
              </span>
            </li>
          );
        })}
      </ul>
      {toolCosts.length > 8 && (
        <button
          type="button"
          onClick={() => setShowAll(v => !v)}
          className="self-start pt-4 text-sm font-medium text-primary hover:text-primary-hover"
        >
          {showAll ? "Show fewer" : `See all ${toolCosts.length} tool costs`}
        </button>
      )}
    </div>
  );
}

export function CreditsExplainer({ subs, term, toolCosts, onChoose }: {
  subs: DbPlan[];
  term: number;
  toolCosts: ToolCost[];
  onChoose: (plan: DbPlan) => void;
}) {
  const items = [
    ...(subs.length > 0 ? [{ id: "estimate", label: "Estimate my usage", content: <Calculator subs={subs} term={term} onChoose={onChoose} /> }] : []),
    ...(toolCosts.length > 0 ? [{ id: "costs", label: "Cost per tool", content: <CostList toolCosts={toolCosts} /> }] : []),
  ];
  if (items.length === 0) return null;

  return (
    <section className="mx-auto grid max-w-6xl gap-8 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-12 lg:gap-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:col-span-4 lg:pt-2">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-primary">How credits work</p>
        <h2 className="text-3xl font-semibold leading-tight tracking-[-0.025em] text-fg sm:text-4xl">One balance for every tool.</h2>
        <p className="text-[15px] leading-relaxed text-fg-muted">
          Spend credits on whatever you need. Unused subscription credits roll over, up to{" "}
          {SUBSCRIPTION_ROLLOVER_CAP_MULTIPLIER}× your monthly allowance. Add-on packs never expire.
        </p>
      </div>
      <div className="rounded-[var(--radius-card)] border border-line bg-surface-1 p-4 sm:p-6 lg:col-span-8">
        <Tabs label="Credits" items={items} />
      </div>
    </section>
  );
}
