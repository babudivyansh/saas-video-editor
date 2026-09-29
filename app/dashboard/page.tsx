"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useAuth } from "@/app/components/AuthContext";
import { useOnboarding } from "@/app/hooks/useOnboarding";
import { FeatureHint } from "@/app/components/onboarding/FeatureHint";

// Dynamically imported: neither renders anything for the large majority of
// dashboard loads (returning users past onboarding), so they shouldn't add
// to the bundle every one of those loads pays for.
const WelcomeScreen = dynamic(
  () => import("@/app/components/onboarding/WelcomeScreen").then(m => m.WelcomeScreen),
  { ssr: false },
);
const ProductTour = dynamic(
  () => import("@/app/components/onboarding/ProductTour").then(m => m.ProductTour),
  { ssr: false },
);
import { PRIMARY_GOALS, GOAL_TO_QUEST } from "@/lib/onboarding-config";
import { QuestCard, type QuestData } from "@/app/components/dashboard/QuestCard";
import { useProjectActions } from "@/app/components/dashboard/useProjectActions";
import { Button } from "@/app/components/ui/Button";
import { SectionHeader } from "@/app/components/ui/SectionHeader";
import { ToastProvider, useToast } from "@/app/components/ui/Toast";
import { ContinueSection } from "@/app/components/dashboard/ContinueSection";
import type { ClipRow } from "@/app/dashboard/clips/hooks/useClipsLibrary";

const HAS_PROJECTS_STORAGE_KEY = "clipiro:hasAnyProjects";

interface InProgressProject {
  id: string;
  title: string;
  status: string;
  progress: number;
  productType: string;
  createdAt: string;
  updatedAt: string;
  clipCount: number;
}

interface DashboardSummary {
  stats: { totalProjects: number; activeProjects: number; completedProjects: number; totalClips: number };
  inProgress: InProgressProject[];
  /** Everything the rail could show, so we know when to offer "view all". */
  inProgressTotal: number;
  hasAnyProjects: boolean;
}

function inProgressHref(p: InProgressProject): string {
  if (p.productType === "editor") return `/dashboard/editor?projectId=${p.id}`;
  return `/dashboard/create/auto-clip?project=${p.id}`;
}

// ── Icons ──────────────────────────────────────────────────────────────────────
const svg = {
  viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75,
  strokeLinecap: "round", strokeLinejoin: "round",
} as const;
function IcChevron() { return <svg {...svg} strokeWidth={2} className="w-4 h-4"><path d="M9 18l6-6-6-6" /></svg>; }
function IcGift() { return <svg {...svg} className="w-5 h-5"><path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" /></svg>; }
function IcWrench() { return <svg {...svg} className="w-[18px] h-[18px]"><path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" /></svg>; }
function IcScissors() { return <svg {...svg} className="w-[22px] h-[22px]"><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12" /></svg>; }
function IcCrop() { return <svg {...svg} className="w-[22px] h-[22px]"><path d="M6 2v14a2 2 0 002 2h14M18 22V8a2 2 0 00-2-2H2" /></svg>; }
function IcWave() { return <svg {...svg} className="w-[22px] h-[22px]"><path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" /></svg>; }
function IcSubs() { return <svg {...svg} className="w-[22px] h-[22px]"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 12h4M13 12h4M7 15h10" /></svg>; }
function IcImage() { return <svg {...svg} className="w-[18px] h-[18px]"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>; }
function IcUser() { return <svg {...svg} className="w-[18px] h-[18px]"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>; }
function IcMic() { return <svg {...svg} className="w-[18px] h-[18px]"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" /></svg>; }
function IcEraser() { return <svg {...svg} className="w-[18px] h-[18px]"><path d="M20 20H7L3 16l10-10 7 7-3.5 3.5" /><path d="M6.5 17.5l4-4" /></svg>; }
function IcMusic() { return <svg {...svg} className="w-[18px] h-[18px]"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>; }
function IcYoutube() { return <svg {...svg} className="w-[18px] h-[18px]"><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M10 9l5 3-5 3z" /></svg>; }

// ── Data ───────────────────────────────────────────────────────────────────────
function useFeaturedTools() {
  const t = useTranslations("Dashboard.tools");
  return useMemo(
    () => [
      { icon: <IcScissors />, title: t("autoClip.title"), desc: t("autoClip.desc"), href: "/dashboard/create/auto-clip" },
      { icon: <IcCrop />, title: t("cutCrop.title"), desc: t("cutCrop.desc"), href: "/dashboard/cut-and-crop" },
      { icon: <IcWave />, title: t("voiceChanger.title"), desc: t("voiceChanger.desc"), href: "/dashboard/tools/voice-changer" },
      { icon: <IcSubs />, title: t("subtitleRemover.title"), desc: t("subtitleRemover.desc"), href: "/dashboard/tools/subtitle-remover" },
    ],
    [t]
  );
}

function useMiniTools() {
  const t = useTranslations("Dashboard.miniTools");
  // The vocal remover's name comes from the tools page's namespace, which
  // every locale already translates.
  const tTools = useTranslations("Tools");
  return useMemo(
    () => [
      { icon: <IcImage />, label: t("imageGenerator"), href: "/dashboard/tools/image-generator" },
      { icon: <IcUser />, label: t("aiFaceSwap"), href: "/dashboard/tools/face-swap" },
      { icon: <IcMic />, label: t("voiceoverGenerator"), href: "/dashboard/tools/voiceover" },
      { icon: <IcEraser />, label: t("backgroundRemover"), href: "/dashboard/tools/background-remover" },
      { icon: <IcMusic />, label: tTools("items.vocalRemover.title"), href: "/dashboard/tools/vocal-remover" },
      { icon: <IcYoutube />, label: t("youtubeDownloader"), href: "/dashboard/tools/youtube-downloader" },
    ],
    [t, tTools]
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
// ToastProvider is not mounted globally in this app (see the note in
// app/dashboard/social-tracker/layout.tsx) — each page that needs toasts wraps
// itself, so the inner component can call useToast().
export default function DashboardPage() {
  return (
    <ToastProvider>
      <DashboardPageInner />
    </ToastProvider>
  );
}

function DashboardPageInner() {
  const { user, token } = useAuth();
  const t = useTranslations("Dashboard");
  const { showToast } = useToast();
  const tNav = useTranslations("Nav");
  const featuredTools = useFeaturedTools();
  const miniTools = useMiniTools();
  const { shouldShowWelcome, shouldResumeTour, tourStep, advanceTour, finishTour } = useOnboarding();
  const [showTour, setShowTour] = useState(false);
  // Lazy initializer runs once at mount — a stable snapshot rather than
  // calling Date.now() directly during render (which React's purity rules
  // flag as an impure render).
  const [now] = useState(() => Date.now());
  const [questData, setQuestData] = useState<QuestData | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  // A failed summary used to leave the skeleton pulsing forever for returning
  // users; now it becomes an error card with a retry.
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [summaryAttempt, setSummaryAttempt] = useState(0);
  // Avoids a first-time-layout flash for known-returning users while the real
  // summary fetch is in flight (this client page has no server-fetch seam).
  // Starts false so server-rendered HTML and the first client render match
  // (sessionStorage isn't readable during SSR) — set for real just after
  // mount, one tick before the summary fetch would otherwise resolve.
  const [optimisticReturning, setOptimisticReturning] = useState(false);
  const [explicitRestart, setExplicitRestart] = useState(false);
  // Latched separately from shouldShowWelcome: selecting a goal sets
  // onboardingCompletedAt immediately (so it's never lost if the tab closes
  // mid-flow), which would otherwise flip shouldShowWelcome to false and
  // unmount the overlay before its later steps (preferences, tour offer)
  // ever get a chance to show. Once open, only WelcomeScreen's own onClose
  // closes it — not a server-state change underneath it.
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  useEffect(() => {
    setOptimisticReturning(sessionStorage.getItem(HAS_PROJECTS_STORAGE_KEY) === "true");
    if (sessionStorage.getItem("clipiro:restartOnboarding") === "1") {
      sessionStorage.removeItem("clipiro:restartOnboarding");
      setExplicitRestart(true);
    }
  }, []);

  useEffect(() => {
    if (!user || !token) return;
    fetch("/api/quests", { headers: { Authorization: `Bearer ${token}` } })
      // r.ok, not just r.json(): an error response still parses, and storing
      // {error:"Unauthorized"} as quest data crashes the reads below.
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setQuestData(d); })
      .catch(() => setSummaryFailed(true));
  }, [user, token, summaryAttempt]);

  // Rank rewards are granted server-side from inside tool routes, where no
  // client is listening — so the credits used to arrive with no acknowledgement
  // at all. Announce them on the next dashboard load, then ack so each grant is
  // only ever toasted once.
  const ackedRewards = useRef(false);
  useEffect(() => {
    const rewards = questData?.newRankRewards;
    if (!token || !rewards?.length || ackedRewards.current) return;
    ackedRewards.current = true;
    for (const r of rewards) {
      showToast(t("rankRewardToast", { level: r.level, minutes: r.reward }), "success");
    }
    fetch("/api/quests/ack-rewards", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => { /* best-effort; worst case it re-toasts next load */ });
  }, [questData, token, showToast, t]);

  useEffect(() => {
    if (!user || !token) return;
    setSummaryFailed(false);
    fetch("/api/dashboard/summary", { headers: { Authorization: `Bearer ${token}` } })
      // Without the r.ok check a 401/500 body ({error:"..."}) parsed fine and was
      // stored as the summary — then `summary?.inProgress[0]` below read [0] of
      // undefined and took the whole dashboard to its error boundary.
      .then(r => (r.ok ? r.json() : null))
      .then((d: DashboardSummary | null) => {
        if (!d) { setSummaryFailed(true); return; }
        setSummary(d);
        if (d.hasAnyProjects) sessionStorage.setItem(HAS_PROJECTS_STORAGE_KEY, "true");
      })
      .catch(() => {});
  }, [user, token]);

  async function handleDiscordQuest() {
    if (!token) return;
    window.open("/discord", "_blank");
    try {
      await fetch("/api/quests/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ questId: "join-community" }),
      });
      const res = await fetch("/api/quests", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setQuestData(await res.json());
    } catch { /* best-effort */ }
  }

  // No react-query at this level, and the summary endpoint caches for 60s
  // server-side, so both handlers patch local state rather than refetching.
  // (The API also drops that cache on write, so a later reload agrees.)
  const projectActions = useProjectActions({
    labels: {
      rename: t("renameProject"),
      delete: t("deleteProject"),
      renameTitle: t("renameProject"),
      renameMessage: t("renameProjectMessage"),
      renameConfirm: t("renameProjectConfirm"),
      deleteTitle: t("deleteProjectTitle"),
      deleteMessage: (title: string) => t("deleteProjectMessage", { title }),
      deleteConfirm: t("deleteProject"),
      deleted: t("projectDeleted"),
      renamed: t("projectRenamed"),
      failed: t("projectActionFailed"),
    },
    onDeleted: (id) =>
      setSummary(s =>
        s && {
          ...s,
          inProgress: s.inProgress.filter(p => p.id !== id),
          inProgressTotal: Math.max(0, s.inProgressTotal - 1),
          stats: { ...s.stats, activeProjects: Math.max(0, s.stats.activeProjects - 1) },
        },
      ),
    onRenamed: (id, title) =>
      setSummary(s => s && { ...s, inProgress: s.inProgress.map(p => (p.id === id ? { ...p, title } : p)) }),
  });

  const firstName = user?.name?.split(" ")[0];

  // The hero shows the user's own best clips. Nothing to show → no fan.
  const heroQuery = useQuery({
    queryKey: ["clips", "list", "home-hero"],
    queryFn: async (): Promise<ClipRow[]> => {
      const res = await fetch("/api/clips?sort=score&status=ready&limit=6", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return [];
      return (await res.json()).clips ?? [];
    },
    enabled: !!user,
    staleTime: 60_000,
  });
  const heroClips = (heroQuery.data ?? []).filter((c) => c.thumbnailUrl).slice(0, 3);


  // Gated on summary having loaded so existing users with real projects never
  // flash the welcome screen before it's suppressed — every pre-existing user
  // has onboardingCompletedAt === null after the migration, so hasAnyProjects
  // is what actually protects them from seeing this retroactively. An
  // explicit restart (profile settings → Restart Tour) bypasses that guard —
  // the user asked for it, so hasAnyProjects shouldn't block it.
  const showWelcome = shouldShowWelcome && (explicitRestart || (summary !== null && !summary.hasAnyProjects));

  useEffect(() => {
    if (showWelcome) setWelcomeOpen(true);
  }, [showWelcome]);

  // Tour renders either right after the welcome screen (in-session opt-in) or
  // across a reload if the user left mid-tour — shouldResumeTour is only ever
  // true once a tour has actually been started for this user, so it's safe
  // for pre-existing users too.
  const showTourOverlay = !welcomeOpen && (showTour || shouldResumeTour);

  async function handleTourFinish() {
    await finishTour();
    setShowTour(false);
  }

  // Nudges a user back toward the goal they picked on the welcome screen if
  // they haven't gotten there yet — only one hint at a time, only once the
  // welcome screen is at least a day old (no point nagging mid-session), and
  // never shown again once dismissed.
  const goalDef = user?.primaryGoal ? PRIMARY_GOALS.find(g => g.id === user.primaryGoal) : undefined;
  const goalQuestId = user?.primaryGoal ? GOAL_TO_QUEST[user.primaryGoal as keyof typeof GOAL_TO_QUEST] : undefined;
  // quests?.find, not quests.find: any response body without a quests array —
  // a 401 or error payload that still parses as JSON — otherwise throws here and
  // takes the whole dashboard into the error boundary.
  const goalQuestDone = questData?.quests?.find(q => q.id === goalQuestId)?.completedAt != null;
  const onboardedDaysAgo = user?.onboardingCompletedAt
    ? (now - new Date(user.onboardingCompletedAt).getTime()) / 86_400_000
    : 0;
  const goalHintId = goalDef ? `try-${goalDef.id}` : null;
  const showGoalHint =
    !!goalDef &&
    !goalQuestDone &&
    onboardedDaysAgo >= 1 &&
    !!questData &&
    !!goalHintId &&
    !(user?.dismissedHints ?? []).includes(goalHintId);

  return (
    <>
        {projectActions.overlays}
        {welcomeOpen && (
          <WelcomeScreen
            firstName={firstName}
            resumeProject={summary?.inProgress?.[0]}
            onStartTour={() => { setShowTour(true); setWelcomeOpen(false); }}
            onClose={() => setWelcomeOpen(false)}
          />
        )}
        {showTourOverlay && (
          <ProductTour
            startStep={tourStep}
            onAdvance={advanceTour}
            onFinish={handleTourFinish}
            onSkip={handleTourFinish}
          />
        )}
        <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-8 pt-6 pb-12">
          <div className="grid xl:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
            <div className="min-w-0 space-y-8">

              {/* ── Hero — product, not a gradient wash ── */}
              <section className="flex items-center gap-8 rounded-[var(--radius-feature)] border border-line bg-surface-2 px-6 sm:px-8 py-7 sm:py-8 overflow-hidden">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
                    {firstName ? t("welcomeBack", { name: firstName }) : t("aiClipStudio")}
                  </p>
                  <h1 className="mt-2.5 text-2xl sm:text-[32px] font-semibold tracking-tight text-fg leading-tight max-w-md">
                    {t("heroTitle")}
                  </h1>
                  <p className="mt-3 text-sm text-fg-muted leading-relaxed max-w-lg">{t("heroSubtitle")}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-6">
                    <Button variant="primary" size="lg" href="/dashboard/create/auto-clip" icon={<IcChevron />}>
                      {t("startAutoClipping")}
                    </Button>
                    <Button variant="secondary" size="lg" href="/dashboard/editor">
                      {t("openEditor")}
                    </Button>
                  </div>
                </div>
                {heroClips.length > 0 && (
                  // Your own best clips, fanned — the page shows what the product
                  // made for you instead of decoration.
                  <div className="relative hidden md:block w-[300px] h-[250px] flex-shrink-0" aria-hidden="true">
                    {heroClips.map((c, i) => (
                      <div
                        key={c.id}
                        className={`absolute overflow-hidden rounded-2xl border bg-surface-3 aspect-[9/16] ${
                          i === 0
                            ? "left-[86px] top-0 w-[130px] z-10 border-primary/40"
                            : i === 1
                              ? "left-0 top-[30px] w-[118px] -rotate-6 border-line"
                              : "right-0 top-[30px] w-[118px] rotate-6 border-line"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={c.thumbnailUrl!} alt="" className="w-full h-full object-cover" />
                        {i === 0 && typeof c.score === "number" && (
                          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-bg/80 text-xs font-bold text-primary">{c.score}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* ── Continue where you left off ── */}
              {summary === null && summaryFailed && (
                <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-error/30 bg-error/10 px-4 py-3">
                  <p className="text-sm text-fg">{t("summaryLoadFailed")}</p>
                  <button
                    type="button"
                    onClick={() => setSummaryAttempt((n) => n + 1)}
                    className="rounded-full border border-line bg-surface-2 px-3.5 py-1.5 text-xs font-semibold text-fg hover:bg-surface-3 outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                  >
                    {t("retry")}
                  </button>
                </div>
              )}
              {summary === null && !summaryFailed && optimisticReturning && (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-[68px] rounded-2xl bg-surface-2 animate-pulse" />)}
                </div>
              )}
              {summary?.hasAnyProjects && (
                <ContinueSection
                  projects={summary.inProgress}
                  total={summary.inProgressTotal}
                  hrefFor={inProgressHref}
                  onRename={(p) => projectActions.startRename({ id: p.id, title: p.title })}
                  onDelete={(p) => projectActions.startDelete({ id: p.id, title: p.title })}
                  onMenu={(e, p) => projectActions.openMenu(e, { id: p.id, title: p.title })}
                />
              )}

              {showGoalHint && goalDef && goalHintId && (
                <FeatureHint
                  hintId={goalHintId}
                  title={t("stillWantTo", { goal: goalDef.label.toLowerCase() })}
                  body={goalDef.description}
                  cta={{ label: t("tryItNow"), href: goalDef.href }}
                />
              )}

              {/* ── Start creating ── */}
              <section className="space-y-4">
                <SectionHeader title={t("startCreating")} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {featuredTools.map((tool) => (
                    <Link
                      key={tool.href}
                      href={tool.href}
                      className="group flex items-start gap-4 rounded-[var(--radius-panel)] border border-line bg-surface-1 p-5 hover:border-primary/40 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                    >
                      <span className="w-12 h-12 rounded-2xl bg-surface-3 border border-line text-primary flex items-center justify-center flex-shrink-0">{tool.icon}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-base font-semibold text-fg">{tool.title}</span>
                        <span className="block text-[13px] text-fg-muted mt-1 leading-relaxed">{tool.desc}</span>
                        <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-primary">
                          {t("tryNow")} <IcChevron />
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              </section>

              {/* ── Clipiro Tools ── */}
              <section className="space-y-4">
                <SectionHeader title={t("clipiroTools")} action={{ label: t("viewAllTools"), href: "/dashboard/tools" }} />
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {miniTools.map((tool) => (
                    <Link
                      key={tool.href}
                      href={tool.href}
                      className="flex items-center gap-3 rounded-2xl border border-line bg-surface-1 px-4 py-3.5 hover:border-primary/40 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                    >
                      <span className="w-9 h-9 rounded-xl bg-surface-3 border border-line text-primary flex items-center justify-center flex-shrink-0">{tool.icon}</span>
                      <span className="text-sm font-medium text-fg leading-tight">{tool.label}</span>
                    </Link>
                  ))}
                </div>
              </section>
            </div>

            {/* ── Right rail ── */}
            <aside className="space-y-4 xl:sticky xl:top-6">
              {summary?.hasAnyProjects && (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    [t("totalClips"), summary.stats.totalClips],
                    [t("activeProjects"), summary.stats.activeProjects],
                    [t("minutesRemaining"), user?.minutes ?? 0],
                    [t("creditsRemaining"), user?.credits ?? 0],
                  ].map(([label, value], i) => (
                    <div key={i} className="rounded-2xl border border-line bg-surface-1 px-4 py-3.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-subtle">{label}</p>
                      <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${i >= 2 ? "text-primary" : "text-fg"}`}>{value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Onboarding quests. Collapsed to a header by default; expanded
                  it is the tallest block on the page, which is why it lives in
                  the rail rather than above "Start creating". */}
              <QuestCard questData={questData} hasUser={!!user} onDiscordQuest={handleDiscordQuest} variant="rail" />

              <Link
                href="/dashboard/referral"
                className="block rounded-[var(--radius-panel)] border border-line bg-surface-1 p-4 hover:border-primary/40 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
              >
                <span className="w-10 h-10 rounded-xl bg-surface-3 border border-line text-primary flex items-center justify-center"><IcGift /></span>
                <span className="block mt-3 text-[15px] font-semibold text-fg">{tNav("rail.earnCredits")}</span>
                <span className="block mt-1 text-[13px] text-fg-muted leading-relaxed">{tNav("affiliateDesc")}</span>
              </Link>

              <Link
                href="/dashboard/tools/free"
                className="flex items-center gap-3 rounded-[var(--radius-panel)] border border-line bg-surface-1 px-4 py-3.5 hover:border-primary/40 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
              >
                <span className="w-9 h-9 rounded-xl bg-surface-3 border border-line text-primary flex items-center justify-center flex-shrink-0"><IcWrench /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold text-fg">
                    {t.rich("freeToolsCard.title", { em: (chunks) => <span className="text-primary">{chunks}</span> })}
                  </span>
                  <span className="block text-xs text-fg-muted mt-0.5">{t("freeToolsCard.desc")}</span>
                </span>
                <span className="text-fg-subtle"><IcChevron /></span>
              </Link>
            </aside>
          </div>
        </div>
    </>
  );
}
