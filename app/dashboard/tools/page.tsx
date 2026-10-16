"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { APP_TOOL_GROUPS, HUB_TOOLS, type AppToolGroup, type FeatureLink } from "@/app/components/featureLinks";
import { ToolIcon } from "@/app/components/toolIcons";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { readRecentTools, recordRecentTool } from "@/app/components/dashboard/recentTools";
import { TOOL_COSTS, IMAGE_GENERATOR_STARTING_CREDIT_COST } from "@/lib/tool-costs";
import { voiceFxCredits } from "@/lib/audio-pricing";
import { subtitleRemoverCredits } from "@/lib/subtitle-remover-pricing";

// The cheapest a run can actually cost, where that differs from creditCost.
// The duration-priced tools store their per-MINUTE rate there, so the badge
// read "From 8 credits" for a clip that costs 1-2.
const MIN_CREDITS: Record<string, number> = {
  "voice-changer": voiceFxCredits(1),
  "enhance-speech": voiceFxCredits(1),
  "subtitle-remover": subtitleRemoverCredits(0),
};

// The AI Tools hub: every single-purpose tool, rendered from the registry
// (featureLinks.ts) so a new tool appears here, in search and on the public
// site at once. AutoClip and the Editor are not here — they are the product,
// and own their own nav items.

type Filter = "all" | AppToolGroup;

function useBadge() {
  const t = useTranslations("Tools.hub");
  return (tool: FeatureLink): { label: string; tone: "free" | "pro" | "credits" } => {
    // Badges read the billing registries rather than restating numbers here: the
    // old hardcoded copies drifted from what users were actually charged. The
    // multi-model image tool shows its cheapest model's price.
    const key = tool.costKey ?? tool.slug;
    const cost = TOOL_COSTS[key];
    const credits = tool.slug === "ai-image-generator"
      ? IMAGE_GENERATOR_STARTING_CREDIT_COST
      : (MIN_CREDITS[key] ?? cost?.creditCost ?? 0);
    // Pro tools show their price too, not just the plan.
    if (cost?.requiredTier) return { label: `${t("proBadge")} · ${t("fromCredits", { count: credits })}`, tone: "pro" };
    if (credits === 0) return { label: t("freeBadge"), tone: "free" };
    return { label: t("fromCredits", { count: credits }), tone: "credits" };
  };
}

function HubTile({ tool, badge }: { tool: FeatureLink; badge: ReturnType<ReturnType<typeof useBadge>> }) {
  const tone =
    badge.tone === "free" ? "text-success bg-success/10 border-success/25"
    : badge.tone === "pro" ? "text-warning bg-warning/10 border-warning/25"
    : "text-fg-muted bg-surface-3 border-line";
  return (
    <Link
      href={tool.href}
      onClick={() => recordRecentTool(tool.slug)}
      className="group flex items-start gap-3.5 rounded-[var(--radius-panel)] border border-line bg-surface-1 p-4 hover:border-primary/40 hover:bg-surface-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
    >
      <span className="w-10 h-10 rounded-xl bg-surface-3 border border-line text-primary flex items-center justify-center flex-shrink-0 group-hover:border-primary/40 transition-colors">
        <ToolIcon name={tool.icon} className="w-5 h-5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold text-fg truncate">{tool.title}</span>
          <span className={`ml-auto flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{badge.label}</span>
        </span>
        <span className="block mt-1 text-[13px] text-fg-muted leading-snug">{tool.desc}</span>
      </span>
    </Link>
  );
}

export default function ToolsPage() {
  const t = useTranslations("Tools.hub");
  const badgeFor = useBadge();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  // Read after mount: localStorage isn't there during SSR, and reading it in
  // render would mismatch the server HTML.
  const [recent, setRecent] = useState<FeatureLink[]>([]);
  useEffect(() => {
    const bySlug = new Map(HUB_TOOLS.map((tool) => [tool.slug, tool]));
    setRecent(readRecentTools().map((slug) => bySlug.get(slug)).filter((tool): tool is FeatureLink => !!tool));
  }, []);

  const q = query.trim().toLowerCase();
  const sections = useMemo(
    () =>
      APP_TOOL_GROUPS.filter((group) => filter === "all" || filter === group)
        .map((group) => ({
          group,
          tools: HUB_TOOLS.filter(
            (tool) => tool.appGroup === group && (!q || `${tool.title} ${tool.desc}`.toLowerCase().includes(q)),
          ),
        }))
        .filter((section) => section.tools.length > 0),
    [filter, q],
  );

  const chips: Filter[] = ["all", ...APP_TOOL_GROUPS];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-8 pt-6 pb-12 space-y-7">
      {/* ── Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-end gap-4 pt-2">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight text-fg">{t("title")}</h1>
          <p className="text-sm text-fg-muted mt-1">{t("subtitle")}</p>
        </div>
        <label className="relative w-full lg:w-80">
          <span className="sr-only">{t("searchLabel")}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full h-10 rounded-xl border border-line bg-surface-1 pl-9 pr-3 text-sm text-fg placeholder:text-fg-subtle outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          />
        </label>
      </div>

      {/* ── Filter chips ── */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1" role="group" aria-label={t("filterLabel")}>
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            aria-pressed={filter === chip}
            onClick={() => setFilter(chip)}
            className={`flex-shrink-0 h-8 rounded-full border px-3.5 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
              filter === chip
                ? "border-primary/50 bg-primary/15 text-fg"
                : "border-line bg-surface-1 text-fg-muted hover:text-fg hover:bg-surface-2"
            }`}
          >
            {chip === "all" ? t("all") : t(`groups.${chip}`)}
          </button>
        ))}
      </div>

      {/* ── Recently used ── */}
      {recent.length > 0 && filter === "all" && !q && (
        <section className="space-y-3" aria-labelledby="hub-recent">
          <h2 id="hub-recent" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">{t("recentlyUsed")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {recent.map((tool) => <HubTile key={tool.slug} tool={tool} badge={badgeFor(tool)} />)}
          </div>
        </section>
      )}

      {/* ── Sections ── */}
      {sections.length === 0 ? (
        <EmptyState icon={<ToolIcon name="sparkle" className="w-6 h-6" />} title={t("noResults")} subtitle={t("noResultsHint")} />
      ) : (
        sections.map(({ group, tools }) => (
          <section key={group} className="space-y-3" aria-labelledby={`hub-${group}`}>
            <h2 id={`hub-${group}`} className="text-base font-semibold text-fg">{t(`groups.${group}`)}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {tools.map((tool) => <HubTile key={tool.slug} tool={tool} badge={badgeFor(tool)} />)}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
