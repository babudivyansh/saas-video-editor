"use client";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { ToastProvider, useToast } from "@/app/components/ui/Toast";
import { ContinueSection } from "@/app/components/dashboard/ContinueSection";
import type { ClipRow } from "@/app/dashboard/clips/hooks/useClipsLibrary";
import type { ProjectRow } from "@/app/dashboard/clips/components/projectUi";
import { AutoClipLaunchBox } from "@/app/components/dashboard/AutoClipLaunchBox";
import { HomeEmptyState, RecentProjects, ToolChips, TopClips, WhatsNew } from "@/app/components/dashboard/HomeSections";
import { HomeTopBar } from "@/app/components/dashboard/HomeTopBar";

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

  // The user's best clips: three fan out in the hero, the rest fill the
  // "top clips" row. One request for both.
  const heroQuery = useQuery({
    queryKey: ["clips", "list", "home-top"],
    queryFn: async (): Promise<ClipRow[]> => {
      const res = await fetch("/api/clips?sort=score&status=ready&limit=10", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return [];
      return (await res.json()).clips ?? [];
    },
    enabled: !!user,
    staleTime: 60_000,
  });
  const topClips = (heroQuery.data ?? []).filter((c) => c.thumbnailUrl);

  // Recent AutoClip runs, as pictures (each run's first rendered thumbnail).
  const projectsQuery = useQuery({
    queryKey: ["projects", "home-recent"],
    queryFn: async (): Promise<ProjectRow[]> => {
      const res = await fetch("/api/projects?productType=auto-clip&cover=1&limit=8", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return [];
      return (await res.json()).projects ?? [];
    },
    enabled: !!user,
    staleTime: 60_000,
  });
  const recentProjects = projectsQuery.data ?? [];

  const questsRef = useRef<HTMLDivElement>(null);
  const questsLeft = questData ? (questData.allComplete ? 0 : (questData.remaining ?? 0)) : null;
  function scrollToQuests() {
    questsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }


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
        {/* One centered column (design B): no shell header from xl up — the
            page's own top bar stands in — and no right rail. */}
        <div className="mx-auto w-full max-w-[1304px] px-4 sm:px-8 pt-5 pb-16">
          <HomeTopBar firstName={firstName} questsLeft={questsLeft} onQuests={scrollToQuests} />

          <div className="mt-8 xl:mt-16">
            <AutoClipLaunchBox />
          </div>

          <div className="mt-9">
            <ToolChips />
          </div>

          <div className="mt-14 space-y-10 sm:space-y-12">
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

            {/* In-progress runs, with rename/delete — how users clear drafts. */}
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

            {summary !== null && !summary.hasAnyProjects ? (
              <HomeEmptyState />
            ) : (
              <>
                <RecentProjects projects={recentProjects} />
                <TopClips clips={topClips} />
              </>
            )}

            <WhatsNew />

            {/* Onboarding quests: collapsed to a bar by default, at the foot of
                the page; the top bar's "N quests left" chip scrolls here. */}
            <div id="home-quests" ref={questsRef} className="mx-auto max-w-[720px] scroll-mt-6">
              <QuestCard questData={questData} hasUser={!!user} onDiscordQuest={handleDiscordQuest} variant="rail" />
            </div>
          </div>
        </div>
    </>
  );
}
