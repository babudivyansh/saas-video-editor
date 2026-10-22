"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { APP_TOOL_GROUPS, HUB_TOOLS, type AppToolGroup, type FeatureLink } from "@/app/components/featureLinks";
import { ToolIcon } from "@/app/components/toolIcons";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { useAuth } from "@/app/components/AuthContext";
import { readRecentTools, recordRecentTool } from "@/app/components/dashboard/recentTools";
import { TOOL_COSTS, IMAGE_GENERATOR_STARTING_CREDIT_COST } from "@/lib/tool-costs";
import { voiceFxCredits } from "@/lib/audio-pricing";
import { subtitleRemoverCredits } from "@/lib/subtitle-remover-pricing";
import { effectivePlan } from "@/lib/plans/effective-plan";
import { tierAtLeast, TIER_LABEL, type TierId } from "@/lib/plans/tiers";
import { ToolStage, ToolThumb, STAGE_GROUPS } from "./HubPreviews";
import s from "./hub.module.css";

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
//
// Video, Image and Audio are "story" sections: a big looping before/after
// stage that tours the section's tools every 7s, and follows the cursor while
// it is on a tool row. Writing and the free utilities sit in a strip below.

type Filter = "all" | AppToolGroup;
type StageGroup = (typeof STAGE_GROUPS)[number];
const TOUR_MS = 7000;

// Badges read the billing registries rather than restating numbers here: the
// old hardcoded copies drifted from what users were actually charged. The
// multi-model image tool shows its cheapest model's price.
function costOf(tool: FeatureLink): { credits: number; requiredTier?: TierId } {
  const key = tool.costKey ?? tool.slug;
  const cost = TOOL_COSTS[key];
  const credits = tool.slug === "ai-image-generator"
    ? IMAGE_GENERATOR_STARTING_CREDIT_COST
    : (MIN_CREDITS[key] ?? cost?.creditCost ?? 0);
  return { credits, requiredTier: cost?.requiredTier };
}

/** Free → "Free"; locked behind a plan the user lacks → that plan's tag;
 *  otherwise an info dot with the price on hover. */
function CostMark({ tool, tier }: { tool: FeatureLink; tier: TierId }) {
  const t = useTranslations("Tools.hub");
  const { credits, requiredTier } = costOf(tool);
  if (credits === 0) {
    return <span className="flex-none rounded-full border border-success/25 bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">{t("freeBadge")}</span>;
  }
  if (requiredTier && requiredTier !== "free" && !tierAtLeast(tier, requiredTier)) {
    return <span className="flex-none rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">{TIER_LABEL[requiredTier]}</span>;
  }
  const tip = t("costTip", { count: credits });
  return (
    <>
      <span className={s.info} data-tip={tip} aria-hidden="true">i</span>
      <span className="sr-only">{tip}</span>
    </>
  );
}

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduce;
}

function StorySection({ group, index, tools, tier }: { group: StageGroup; index: number; tools: FeatureLink[]; tier: TierId }) {
  const t = useTranslations("Tools.hub");
  const reduce = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const [hovering, setHovering] = useState(false);
  const current = tools[Math.min(active, tools.length - 1)];

  // One timeout per shown tool: hovering cancels it, leaving starts a fresh
  // full cycle, and a stage swap never cuts a preview off mid-wipe.
  useEffect(() => {
    if (hovering || reduce || tools.length < 2) return;
    const id = window.setTimeout(() => setActive((a) => (a + 1) % tools.length), TOUR_MS);
    return () => window.clearTimeout(id);
  }, [active, hovering, reduce, tools.length]);

  const show = (i: number) => { setActive(i); setHovering(true); };
  const release = () => setHovering(false);

  return (
    <section
      className={`mt-20 flex flex-wrap items-center gap-9 ${index % 2 ? "flex-row-reverse" : ""}`}
      aria-labelledby={`hub-${group}`}
    >
      <div className={`${s.stage} min-w-0 flex-[999_1_560px]`}>
        {/* keyed so each tool mounts fresh and its loop starts at frame 0 */}
        <div key={current.slug} className="absolute inset-0">
          <ToolStage tool={current} />
        </div>
      </div>
      <div className="flex flex-[1_1_340px] flex-col gap-[18px]">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
          {String(index + 1).padStart(2, "0")} · {t(`groups.${group}`)}
        </span>
        <h2 id={`hub-${group}`} className="text-[28px] font-bold leading-[1.1] tracking-[-0.025em] text-fg sm:text-[34px]">
          {t(`stories.${group}`)}
        </h2>
        <ul className="flex flex-col border-t border-line">
          {tools.map((tool, i) => (
            <li key={tool.slug}>
              <Link
                href={tool.href}
                onClick={() => recordRecentTool(tool.slug)}
                onMouseEnter={() => show(i)}
                onMouseLeave={release}
                onFocus={() => show(i)}
                onBlur={release}
                aria-current={tool.slug === current.slug ? "true" : undefined}
                className={`${s.row} group flex items-center gap-3.5 border-b border-line px-3 py-3.5 text-fg outline-none`}
              >
                <span className="w-[22px] font-mono text-xs font-semibold text-fg-subtle">{String(i + 1).padStart(2, "0")}</span>
                <ToolThumb tool={tool} offset={(i % 3) as 0 | 1 | 2} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={`text-[15px] font-semibold transition-colors group-hover:text-primary ${tool.slug === current.slug ? "text-primary" : "text-fg"}`}>{tool.title}</span>
                  <span className="text-[13px] leading-snug text-fg-muted">{tool.desc}</span>
                </span>
                <CostMark tool={tool} tier={tier} />
                <span className="text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Hero({ toolCount }: { toolCount: number }) {
  const t = useTranslations("Tools.hub.hero");
  const line1 = t("line1").split(" ");
  const line2 = t("line2").split(" ");
  // Words rise in one by one; the last word of line 1 gets framed, the last
  // word of line 2 is struck out.
  const words = (list: string[], start: number, lastClass: string) =>
    list.map((w, i) => (
      <span key={i}>
        <span className={s.word}>
          <span className={i === list.length - 1 ? lastClass : undefined} style={{ animationDelay: `${start + i * 0.12}s` }}>{w}</span>
        </span>
        {i < list.length - 1 ? " " : null}
      </span>
    ));
  const intro: { text: string; cls: string }[] = [
    ...t("introLead", { count: toolCount }).split(" ").map((text) => ({ text, cls: "" })),
    ...t("introHighlight").split(" ").map((text) => ({ text, cls: s.lit })),
    ...t("introMid").split(" ").map((text) => ({ text, cls: "" })),
    ...t("introUnderline").split(" ").map((text) => ({ text, cls: s.underlined })),
  ];
  const introText = intro.map((w) => w.text).join(" ");
  return (
    <div className="mx-auto flex max-w-[820px] flex-col items-center gap-[18px] text-center">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">{t("eyebrow")}</span>
      <h1 aria-label={`${t("line1")} ${t("line2")}`} className="text-[40px] font-bold leading-[1.04] tracking-[-0.04em] text-fg sm:text-[64px]">
        <span aria-hidden="true" className="block">{words(line1, 0, s.framed)}</span>
        <span aria-hidden="true" className="block text-primary">{words(line2, 0.5, s.struck)}</span>
      </h1>
      <p aria-label={introText} className="max-w-[560px] text-[17px] leading-relaxed text-fg-muted">
        {intro.map((w, i) => (
          <span key={i} aria-hidden="true">
            <span className={`${s.introWord} ${w.cls}`} style={{ animationDelay: `${(1.1 + i * 0.06).toFixed(2)}s` }}>{w.text}</span>{" "}
          </span>
        ))}
      </p>
    </div>
  );
}

export default function ToolsPage() {
  const t = useTranslations("Tools.hub");
  const { user } = useAuth();
  // Same helper the server gates entitlements with.
  const tier = effectivePlan(user).tier;
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
  // Stage sections run in STAGE_GROUPS order (Video, Image, Audio), not the
  // registry's, so the alternating stage sides read as designed.
  const stories = sections
    .filter((sec): sec is { group: StageGroup; tools: FeatureLink[] } => (STAGE_GROUPS as readonly string[]).includes(sec.group))
    .sort((a, b) => STAGE_GROUPS.indexOf(a.group) - STAGE_GROUPS.indexOf(b.group));
  const strip = sections.filter((sec) => !(STAGE_GROUPS as readonly string[]).includes(sec.group)).flatMap((sec) => sec.tools);

  const chips: Filter[] = ["all", ...APP_TOOL_GROUPS];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-24 pt-10 sm:px-8">
      <Hero toolCount={HUB_TOOLS.length} />

      {/* ── Filters + search ── */}
      <div className="mt-8 flex flex-col items-center gap-4">
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label={t("filterLabel")}>
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              aria-pressed={filter === chip}
              onClick={() => setFilter(chip)}
              className={`h-9 flex-shrink-0 rounded-full border px-3.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/70 ${
                filter === chip
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-line-strong bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg"
              }`}
            >
              {chip === "all" ? t("all") : t(`groups.${chip}`)}
            </button>
          ))}
        </div>
        <label className="relative w-full max-w-sm">
          <span className="sr-only">{t("searchLabel")}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-10 w-full rounded-xl border border-line bg-surface-1 pl-9 pr-3 text-sm text-fg outline-none placeholder:text-fg-subtle focus-visible:ring-2 focus-visible:ring-primary/70"
          />
        </label>
      </div>

      {/* ── Recently used ── */}
      {recent.length > 0 && filter === "all" && !q && (
        <section className="mt-12 space-y-3" aria-labelledby="hub-recent">
          <h2 id="hub-recent" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">{t("recentlyUsed")}</h2>
          <div className="flex flex-wrap gap-2">
            {recent.map((tool) => (
              <Link
                key={tool.slug}
                href={tool.href}
                onClick={() => recordRecentTool(tool.slug)}
                className="flex items-center gap-2 rounded-full border border-line bg-surface-1 py-1.5 pl-1.5 pr-3.5 text-[13px] font-medium text-fg outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/70"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-3 text-primary"><ToolIcon name={tool.icon} className="h-3.5 w-3.5" /></span>
                {tool.title}
              </Link>
            ))}
          </div>
        </section>
      )}

      {sections.length === 0 ? (
        <div className="mt-16">
          <EmptyState icon={<ToolIcon name="sparkle" className="w-6 h-6" />} title={t("noResults")} subtitle={t("noResultsHint")} />
        </div>
      ) : (
        <>
          {stories.map(({ group, tools }, i) => (
            // keyed on the tool list so a filter change restarts the tour
            <StorySection key={`${group}:${tools.map((x) => x.slug).join(",")}`} group={group} index={i} tools={tools} tier={tier} />
          ))}

          {strip.length > 0 && (
            <section className="mt-20" aria-labelledby="hub-strip">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
                <h2 id="hub-strip" className="text-[22px] font-semibold text-fg">{t("stripTitle")}</h2>
                <span className="text-[13px] text-fg-muted">{t("stripNote")}</span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
                {strip.map((tool) => (
                  <Link
                    key={tool.slug}
                    href={tool.href}
                    onClick={() => recordRecentTool(tool.slug)}
                    className={`${s.card} flex flex-col gap-2 rounded-2xl border border-line bg-surface-1 p-[18px] text-fg outline-none`}
                  >
                    <span className="flex items-center justify-between">
                      <ToolIcon name={tool.icon} className="h-[22px] w-[22px] text-primary" />
                      <CostMark tool={tool} tier={tier} />
                    </span>
                    <span className="text-[15px] font-semibold">{tool.title}</span>
                    <span className="text-[13px] leading-snug text-fg-muted">{tool.desc}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
