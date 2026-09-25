"use client";

// Plan comparison, derived from the constants and registries that enforce each
// limit rather than a hand-kept list. The old hand list drifted twice: it
// marked Creator as having no video generator at all, and it kept a
// "Faceless Story Videos" row for weeks after that product was deleted.

import { useState } from "react";
import {
  TIER_ORDER, TIER_LABEL, TIER_MAX_DURATION_SECONDS, TIER_MAX_AUTOCLIP_SOURCE_SECONDS, STORAGE_LIMIT_GB,
  FREE_TIER_MONTHLY_BONUS_CREDITS, FREE_TIER_AUTOCLIP_RUNS_PER_MONTH, tierAtLeast, type TierId,
} from "@/lib/plans/tiers";
import { TOOL_COSTS } from "@/lib/tool-costs";
import { IMAGE_MODELS } from "@/lib/models/imageModels";
import { VIDEO_MODELS } from "@/lib/models/videoModels";
import type { DbPlan } from "./types";

type Cell = boolean | string;
type Row = { label: string; cells: Record<TierId, Cell> };
type Group = { title: string; rows: Row[] };

const byTier = (f: (t: TierId) => Cell): Record<TierId, Cell> =>
  Object.fromEntries(TIER_ORDER.map(t => [t, f(t)])) as Record<TierId, Cell>;

/** A tool is open to a tier unless lib/tool-costs.ts gates it higher. */
const tool = (slug: string) => byTier(t => {
  const need = TOOL_COSTS[slug]?.requiredTier;
  return !need || tierAtLeast(t, need);
});

const anyModel = (models: readonly { allowedTiers: readonly TierId[] }[]) =>
  byTier(t => models.some(m => m.allowedTiers.includes(t)));

// Models the tier *below* Pro can't use — the premium set Pro unlocks.
const PREMIUM_VIDEO = VIDEO_MODELS.filter(m => !m.allowedTiers.includes("creator"));
const STUDIO_ONLY = [...IMAGE_MODELS, ...VIDEO_MODELS].filter(m => m.allowedTiers.length === 1 && m.allowedTiers[0] === "studio");

const modelsFor = (t: TierId) =>
  [...IMAGE_MODELS, ...VIDEO_MODELS].filter(m => m.allowedTiers.includes(t)).length;

const storage = (gb: number) => (gb < 1 ? `${gb * 1000} MB` : `${gb} GB`);

function buildGroups(subs: DbPlan[], term: number): { core: Group; more: Group[] } {
  const credits = (t: TierId): Cell => t === "free"
    ? String(FREE_TIER_MONTHLY_BONUS_CREDITS)
    : String(subs.find(p => p.tier === t && p.intervalMonths === term)?.monthlyCredits ?? "—");

  const core: Group = {
    title: "Credits & limits",
    rows: [
      { label: "Credits / month", cells: byTier(credits) },
      { label: "Auto Clip runs", cells: byTier(t => (t === "free" ? `${FREE_TIER_AUTOCLIP_RUNS_PER_MONTH} / month` : "Unlimited")) },
      { label: "Auto Clip upload length", cells: byTier(t => {
        const mins = TIER_MAX_AUTOCLIP_SOURCE_SECONDS[t] / 60;
        return mins < 60 ? `${mins} min` : `${mins / 60} hr`;
      }) },
      { label: "Watermark-free exports", cells: byTier(t => t !== "free") },
      { label: "Max AI video length", cells: byTier(t => (t === "free" ? false : `${TIER_MAX_DURATION_SECONDS[t]} s`)) },
      { label: "AI models", cells: byTier(t => String(modelsFor(t))) },
      { label: "Asset storage", cells: byTier(t => storage(STORAGE_LIMIT_GB[t])) },
      { label: "Rendering", cells: { free: "Standard", creator: "Standard", pro: "Priority", studio: "Fastest" } },
    ],
  };

  const more: Group[] = [
    {
      title: "Clipping",
      rows: [
        { label: "Animated captions", cells: tool("caption-render") },
        { label: "Clip Dubbing (29+ languages)", cells: tool("clip-dub") },
        { label: "Social Tracker", cells: byTier(() => true) },
        { label: "Asset library", cells: byTier(() => true) },
      ],
    },
    {
      title: "AI tools",
      rows: [
        { label: "AI Voiceover", cells: tool("voiceover") },
        { label: "AI Image Generator", cells: anyModel(IMAGE_MODELS) },
        { label: "AI Video Generator", cells: anyModel(VIDEO_MODELS) },
        { label: `Premium video models (${PREMIUM_VIDEO.slice(0, 2).map(m => m.displayName).join(", ")})`, cells: anyModel(PREMIUM_VIDEO) },
        ...(STUDIO_ONLY.length > 0
          ? [{ label: STUDIO_ONLY.map(m => m.displayName).join(", "), cells: anyModel(STUDIO_ONLY) }]
          : []),
        { label: "AI Face Swap", cells: tool("face-swap") },
        { label: "Subtitle Remover", cells: tool("subtitle-remover") },
        { label: "Vocal Remover", cells: tool("vocal-remover") },
        { label: "AI Voice Changer", cells: tool("voice-changer") },
        { label: "Speech Enhancer", cells: tool("enhance-speech") },
        { label: "Background Remover", cells: tool("background-remover") },
        { label: "AI Brainstormer", cells: tool("brainstormer") },
      ],
    },
  ];
  return { core, more };
}

function CellValue({ value }: { value: Cell }) {
  if (value === true) {
    return (
      <svg className="mx-auto h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-label="Included" role="img">
        <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (value === false) {
    return (
      <svg className="mx-auto h-5 w-5 text-fg-subtle/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-label="Not included" role="img">
        <path d="M5 12h14" strokeLinecap="round" />
      </svg>
    );
  }
  return <span className="text-sm font-medium text-fg">{value}</span>;
}

export function CompareTable({ subs, term }: { subs: DbPlan[]; term: number }) {
  const [open, setOpen] = useState(false);
  const { core, more } = buildGroups(subs, term);
  const groups = open ? [core, ...more] : [core];
  const tierName = (t: TierId) => (t === "free" ? "Free" : TIER_LABEL[t]);

  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-3xl font-semibold tracking-[-0.025em] text-fg sm:text-4xl">Compare plans</h2>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(v => !v)}
          className="min-h-11 rounded-full px-5 text-sm font-medium text-fg ring-1 ring-inset ring-line-strong hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {open ? "Show fewer rows" : "Show all features"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="bg-surface-2">
              <th scope="col" className="px-6 py-4 text-left text-sm font-medium text-fg-muted">Plan</th>
              {TIER_ORDER.map(t => (
                <th
                  key={t}
                  scope="col"
                  className={`px-4 py-4 text-center text-sm font-semibold ${
                    t === "pro" ? "bg-[color-mix(in_oklab,var(--primary)_5%,transparent)] text-primary" : "text-fg"
                  }`}
                >
                  {tierName(t)}
                </th>
              ))}
            </tr>
          </thead>
          {groups.map(g => (
            <tbody key={g.title}>
              <tr>
                <th colSpan={5} scope="colgroup" className="bg-surface-1 px-6 pb-2.5 pt-4 text-left font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-fg-subtle">
                  {g.title}
                </th>
              </tr>
              {g.rows.map(r => (
                <tr key={r.label} className="border-t border-line">
                  <th scope="row" className="px-6 py-3.5 text-left text-sm font-normal text-fg-muted">{r.label}</th>
                  {TIER_ORDER.map(t => (
                    <td key={t} className={`px-4 py-3.5 text-center ${t === "pro" ? "bg-[color-mix(in_oklab,var(--primary)_4%,transparent)]" : ""}`}>
                      <CellValue value={r.cells[t]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}
