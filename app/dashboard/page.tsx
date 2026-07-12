"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";
import { useOnboarding } from "@/app/hooks/useOnboarding";
import { WelcomeScreen } from "@/app/components/onboarding/WelcomeScreen";
import { xpToLevel, levelColor, TOTAL_XP } from "@/lib/quest-config";
import { ProjectStatusBadge } from "@/app/components/dashboard/ProjectStatusBadge";
import { AutoClipPreview, CutCropPreview, VoiceChangerPreview, SubtitleRemoverPreview, AICreatorPreview } from "@/app/components/dashboard/toolPreviews";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { SectionHeader } from "@/app/components/ui/SectionHeader";
import { StatTile, type StatAccent } from "@/app/components/ui/StatTile";
import { ToolCard } from "@/app/components/ui/ToolCard";

const HAS_PROJECTS_STORAGE_KEY = "clipiro:hasAnyProjects";

interface InProgressProject {
  id: string;
  title: string;
  status: string;
  progress: number;
  productType: string;
  createdAt: string;
  clipCount: number;
}

interface DashboardSummary {
  stats: { totalProjects: number; activeProjects: number; completedProjects: number; totalClips: number };
  inProgress: InProgressProject[];
  hasAnyProjects: boolean;
}

function inProgressHref(p: InProgressProject): string {
  if (p.productType === "editor") return `/dashboard/editor?projectId=${p.id}`;
  return `/dashboard/create/auto-clip?project=${p.id}`;
}

interface QuestItem {
  id: string;
  title: string;
  xp: number;
  trigger: string;
  completedAt: string | null;
}

interface QuestData {
  quests: QuestItem[];
  earnedXp: number;
  totalXp: number;
  remaining: number;
  level: string;
  allComplete: boolean;
}


// ── Misc Icons ─────────────────────────────────────────────────────────────────
function IcChevron() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M9 18l6-6-6-6"/></svg>;
}
function IcDiscord() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>;
}
function IcFilm() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M17 7h5M2 17h5M17 17h5"/></svg>;
}
function IcMic() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>;
}
function IcImage() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>;
}
function IcVideo() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>;
}
function IcUser() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
}
function IcEraser() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M20 20H7L3 16l10-10 7 7-3.5 3.5"/><path d="M6.5 17.5l4-4"/></svg>;
}
function IcYoutube() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 001.46 6.42 29 29 0 001 12a29 29 0 00.46 5.58A2.78 2.78 0 003.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.95A29 29 0 0023 12a29 29 0 00-.46-5.58z"/><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/></svg>;
}

// ── Data ───────────────────────────────────────────────────────────────────────

const QUESTS = [
  { icon: <IcDiscord />, title: "Join the community", xp: 500, desc: "Connect your Discord and join the Clipiro server.", color: "#5865F2" },
  { icon: <IcFilm />, title: "First clip", xp: 300, desc: "Walk through the Simple Editor and make your first clip.", color: "#335cff" },
  { icon: <IcMic />, title: "Hear yourself out", xp: 200, desc: "Generate your first AI voiceover.", color: "#7c3aed" },
  { icon: <IcImage />, title: "Picture this", xp: 200, desc: "Generate your first AI image.", color: "#d946ef" },
];

const TOOLS_LARGE = [
  { title: "Clipiro AutoClip", desc: "Transform long videos into viral clips automatically", preview: <AutoClipPreview />, href: "/dashboard/create/auto-clip" },
  { title: "Cut & Crop", desc: "Trim and stitch your video(s) into one clip ready to edit", preview: <CutCropPreview />, href: "/dashboard/cut-and-crop" },
];
const TOOLS_SMALL = [
  { title: "Voice Changer", desc: "Change the voice of any audio or video file", preview: <VoiceChangerPreview />, href: "/dashboard/tools/voice-changer" },
  { title: "Subtitle Remover", desc: "Remove subtitles with AI in minutes", preview: <SubtitleRemoverPreview />, href: "/dashboard/tools/subtitle-remover" },
  { title: "AI Creator", desc: "Become an AI content creator in 3 steps", preview: <AICreatorPreview />, href: "/dashboard/ai-creator" },
];

// Icon chips cycle through the tint washes with a matching accent color.
const MINI_TOOLS = [
  { icon: <IcImage />,  label: "Image Generator",     href: "/dashboard/tools/image-generator",    chip: "bg-tint-blue text-brand" },
  { icon: <IcUser />,   label: "AI Face Swap",        href: "/dashboard/tools/face-swap",          chip: "bg-tint-violet text-accent-violet" },
  { icon: <IcMic />,    label: "Voiceover Generator", href: "/dashboard/tools/voiceover",          chip: "bg-tint-fuchsia text-accent-fuchsia" },
  { icon: <IcEraser />, label: "Background Remover",  href: "/dashboard/tools/background-remover", chip: "bg-tint-amber text-amber-500" },
  { icon: <IcVideo />,  label: "VEO3 Generator",      href: "/dashboard/tools/video-generator",    chip: "bg-tint-emerald text-emerald-500" },
  { icon: <IcYoutube />,label: "YouTube Downloader",  href: "/dashboard/tools/youtube-downloader", chip: "bg-tint-rose text-accent-pink" },
];

const STAT_ACCENTS: StatAccent[] = ["blue", "violet", "fuchsia", "emerald"];

// ── Page ───────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user, token } = useAuth();
  const { shouldShowWelcome } = useOnboarding();
  const [questData, setQuestData] = useState<QuestData | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  // Avoids a first-time-layout flash for known-returning users while the real
  // summary fetch is in flight (this client page has no server-fetch seam).
  // Starts false so server-rendered HTML and the first client render match
  // (sessionStorage isn't readable during SSR) — set for real just after
  // mount, one tick before the summary fetch would otherwise resolve.
  const [optimisticReturning, setOptimisticReturning] = useState(false);

  useEffect(() => {
    setOptimisticReturning(sessionStorage.getItem(HAS_PROJECTS_STORAGE_KEY) === "true");
  }, []);

  useEffect(() => {
    if (!user || !token) return;
    fetch("/api/quests", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setQuestData)
      .catch(() => {});
  }, [user, token]);

  useEffect(() => {
    if (!user || !token) return;
    fetch("/api/dashboard/summary", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((d: DashboardSummary) => {
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
      setQuestData(await res.json());
    } catch { /* best-effort */ }
  }

  const earnedXp = questData?.earnedXp ?? 0;
  const remaining = questData?.remaining ?? 4;
  const level = questData ? questData.level : (user ? xpToLevel(0) : null);
  const progressPct = Math.round((earnedXp / TOTAL_XP) * 100);
  const firstName = user?.name?.split(" ")[0];


  // Gated on summary having loaded so existing users with real projects never
  // flash the welcome screen before it's suppressed — every pre-existing user
  // has onboardingCompletedAt === null after the migration, so hasAnyProjects
  // is what actually protects them from seeing this retroactively.
  const showWelcome = shouldShowWelcome && summary !== null && !summary.hasAnyProjects;

  return (
    <>
        {showWelcome && (
          <WelcomeScreen firstName={firstName} resumeProject={summary?.inProgress[0]} />
        )}
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-8 pt-6 pb-12 space-y-8">

          {/* ── Gradient hero ── */}
          <div className="relative overflow-hidden rounded-[var(--radius-card)] grad-hero px-6 sm:px-10 py-8 sm:py-10">
            <div className="clipiro-blob absolute -top-16 -right-10 w-64 h-64 rounded-full bg-white/15 blur-3xl pointer-events-none" />
            <div className="clipiro-blob absolute -bottom-20 left-1/4 w-72 h-72 rounded-full bg-fuchsia-400/30 blur-3xl pointer-events-none" style={{ animationDelay: "-9s" }} />
            <div className="relative">
              <p className="text-[11px] font-bold uppercase tracking-widest text-white/70 mb-2">
                {firstName ? `Welcome back, ${firstName} · AI Clip Studio` : "AI Clip Studio"}
              </p>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight max-w-xl">
                Turn long videos into viral clips
              </h1>
              <p className="text-sm text-white/75 mt-2 max-w-lg">
                Drop in a stream, podcast, or interview — AutoClip finds the moments, captions them, and cuts them for every platform.
              </p>
              <div className="flex flex-wrap items-center gap-3 mt-5">
                <Button variant="inverse" size="lg" href="/dashboard/create/auto-clip" icon={<IcChevron />}>
                  Start AutoClipping
                </Button>
                <Button variant="ghost" size="lg" href="/dashboard/editor">
                  Open Editor
                </Button>
              </div>
            </div>
          </div>

          {/* ── Continue where you left off ── */}
          {summary === null && optimisticReturning && (
            <div className="space-y-4">
              <div className="h-5 w-52 bg-gray-200/60 rounded animate-pulse" />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[76px] rounded-[var(--radius-card)] bg-gray-200/60 animate-pulse" />)}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[104px] rounded-[var(--radius-card)] bg-gray-200/60 animate-pulse" />)}
              </div>
            </div>
          )}
          {summary?.hasAnyProjects && (
            <div className="space-y-4">
              <SectionHeader title="Continue where you left off" action={{ label: "View All Clips", href: "/dashboard/clips" }} />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatTile label="Total clips" value={summary.stats.totalClips} accent={STAT_ACCENTS[0]} />
                <StatTile label="Active projects" value={summary.stats.activeProjects} accent={STAT_ACCENTS[1]} />
                <StatTile label="Completed" value={summary.stats.completedProjects} accent={STAT_ACCENTS[2]} />
                <StatTile label="Credits remaining" value={user?.credits ?? 0} accent={STAT_ACCENTS[3]} />
              </div>
              {summary.inProgress.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  {summary.inProgress.map(p => (
                    <Card key={p.id} href={inProgressHref(p)} className="p-4 flex flex-col gap-2 hover:border-violet-200">
                      <p className="text-sm font-semibold text-ink line-clamp-2">{p.title}</p>
                      <p className="text-xs text-ink-soft">{p.clipCount} clip{p.clipCount === 1 ? "" : "s"}</p>
                      <div className="mt-auto pt-2"><ProjectStatusBadge status={p.status} /></div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Onboarding + quick-start row: quest card on the left, the two
                 entry cards stacked to the same total height on the right ── */}
          <div className="flex flex-col lg:flex-row gap-4 items-stretch">

              {/* Onboarding */}
              <Card className="bg-white lg:flex-[3] min-w-0">
                <div className="px-5 py-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-[10px] font-bold text-ink-soft uppercase tracking-widest">Onboarding</p>
                      {level && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: levelColor(level) + "18", color: levelColor(level) }}>
                          {level}
                        </span>
                      )}
                    </div>
                    {questData === null && user ? (
                      <div className="h-5 w-40 bg-gray-100 rounded animate-pulse mt-0.5" />
                    ) : (
                      <p className="text-ink font-bold text-[15px]">
                        {remaining === 0 ? "All quests complete!" : `${remaining} quest${remaining !== 1 ? "s" : ""} to go`}
                      </p>
                    )}
                    <div className="mt-2 h-1 bg-gray-100 rounded-full w-64 overflow-hidden">
                      <div className="h-full grad-brand rounded-full transition-all duration-500"
                        style={{ width: `${progressPct}%` }} />
                    </div>
                  </div>
                  <div className="text-right">
                    {questData === null && user ? (
                      <div className="h-7 w-24 bg-gray-100 rounded animate-pulse ml-auto" />
                    ) : (
                      <>
                        <span className="text-xl font-extrabold grad-text inline-block">{earnedXp}</span>
                        <span className="text-sm text-ink-soft font-normal"> / 1200 XP</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 border-t border-gray-100">
                  {QUESTS.map((q, i) => {
                    const liveQuest = questData?.quests.find(lq => lq.title === q.title);
                    const done = !!liveQuest?.completedAt;
                    const isDiscord = q.title === "Join the community";
                    return (
                      <button
                        key={i}
                        onClick={isDiscord ? handleDiscordQuest : undefined}
                        disabled={done}
                        className={`flex items-start gap-3 px-4 py-3.5 text-left transition-colors group
                          ${i % 2 === 0 ? "border-r border-gray-100" : ""}
                          ${i >= 2 ? "border-t border-gray-100" : ""}
                          ${done ? "bg-tint-emerald cursor-default" : "hover:bg-tint-blue"}`}
                      >
                        <span className="mt-0.5 flex-shrink-0 opacity-60" style={{ color: q.color }}>{q.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <span className={`text-sm font-semibold ${done ? "line-through text-gray-400" : "text-ink"}`}>{q.title}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${done ? "bg-tint-emerald text-green-600 border-green-100" : "bg-tint-violet text-accent-violet border-violet-100"}`}>
                              +{q.xp} XP
                            </span>
                          </div>
                          <p className="text-xs text-ink-soft leading-relaxed">{q.desc}</p>
                        </div>
                        {done ? (
                          <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                        ) : (
                          <span className="text-gray-300 group-hover:text-brand transition-colors mt-0.5 flex-shrink-0"><IcChevron /></span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {questData?.allComplete && (
                  <div className="border-t border-green-100 bg-tint-emerald px-5 py-3 flex items-center gap-2.5">
                    <span className="text-green-500 text-lg">🎉</span>
                    <p className="text-sm font-semibold text-green-700">All quests complete! +5 credits have been added to your account.</p>
                  </div>
                )}
              </Card>

              {/* Quick-start entry cards — stretch to match the quest card */}
              <div className="flex flex-col sm:flex-row lg:flex-col gap-4 lg:flex-[2] min-w-0">
                {/* Free Tools */}
                <Card tint="emerald" href="/dashboard/tools/free" className="flex items-center gap-3 px-5 py-4 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
                    <svg className="w-4 h-4 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l7.07 17 2.51-7.39L21 11.07z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-ink font-bold text-sm leading-tight">Try our <span className="text-emerald-600">FREE</span> Tools</p>
                    <p className="text-ink-soft text-xs mt-0.5">Audio balancer, video compressor, and more</p>
                  </div>
                  <div className="text-emerald-400 flex-shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M9 18l6-6-6-6" strokeLinecap="round"/></svg>
                  </div>
                </Card>

                {/* Editor */}
                <Card tint="blue" href="/dashboard/editor" className="flex items-center gap-3 px-5 py-4 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
                    <svg className="w-4 h-4 text-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2.18" strokeLinecap="round" strokeLinejoin="round"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M17 7h5M2 17h5M17 17h5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-ink font-bold text-sm leading-tight">Open the <span className="text-brand">Editor</span></p>
                    <p className="text-ink-soft text-xs mt-0.5">Multi-track timeline editor in your browser</p>
                  </div>
                  <div className="text-brand/40 flex-shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M9 18l6-6-6-6" strokeLinecap="round"/></svg>
                  </div>
                </Card>
              </div>

          </div>

          {/* ── Start creating ── */}
          <div className="space-y-4">
            <SectionHeader title="Start creating" />
            {/* Large tool cards — 2 col */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {TOOLS_LARGE.map((tool, i) => (
                <ToolCard key={i} size="md" {...tool} />
              ))}
            </div>
            {/* Small tool cards — 3 col */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {TOOLS_SMALL.map((tool, i) => (
                <ToolCard key={i} size="sm" {...tool} />
              ))}
            </div>
          </div>

          {/* ── Clipiro Tools section ── */}
          <div className="space-y-4">
            <SectionHeader title="Clipiro Tools" action={{ label: "View All Tools", href: "/dashboard/tools" }} />
            <div className="grid grid-cols-3 lg:grid-cols-6 gap-4">
              {MINI_TOOLS.map((tool, i) => (
                <Link
                  key={i}
                  href={tool.href}
                  className="flex flex-col items-center justify-center gap-2 px-2 py-4 rounded-[var(--radius-card)] border border-card-border bg-white hover:border-violet-200 hover:shadow-card transition-all group"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${tool.chip}`}>
                    {tool.icon}
                  </div>
                  <span className="text-[11px] font-medium text-gray-700 text-center leading-tight">{tool.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
    </>
  );
}
