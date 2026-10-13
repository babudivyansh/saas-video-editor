"use client";

// Home's library-facing sections: recent AutoClip runs, the best clips they
// produced, and a short strip into the AI Tools hub. Each section renders
// nothing until it has something to show — an empty dashboard is one
// EmptyState on the page, not four.

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { SectionHeader } from "@/app/components/ui/SectionHeader";
import { HOME_TOOLS } from "@/app/components/featureLinks";
import { ToolIcon } from "@/app/components/toolIcons";
import { recordRecentTool } from "@/app/components/dashboard/recentTools";
import { ProjectStatusChip, type ProjectRow } from "@/app/dashboard/clips/components/projectUi";
import type { ClipRow } from "@/app/dashboard/clips/hooks/useClipsLibrary";

const IcFilm = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6" aria-hidden="true"><rect x="2" y="3" width="20" height="18" rx="2" /><path d="M7 3v18M17 3v18M2 9h5M2 15h5M17 9h5M17 15h5" /></svg>;
const IcDownload = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>;
const IcArrow = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7" /></svg>;

function fmtDuration(sec: number | null | undefined): string | null {
  if (sec == null || !Number.isFinite(sec)) return null;
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function scoreTone(score: number): string {
  if (score >= 80) return "text-primary";
  if (score >= 60) return "text-success";
  return "text-fg-muted";
}

// ── Recent projects ──────────────────────────────────────────────────────────

export function RecentProjects({ projects }: { projects: ProjectRow[] }) {
  const t = useTranslations("Dashboard");
  const format = useFormatter();
  if (projects.length === 0) return null;
  return (
    <section className="space-y-4">
      <SectionHeader title={t("home.recentProjects")} action={{ label: t("home.viewAll"), href: "/dashboard/clips" }} />
      <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-4 gap-3 sm:gap-4">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/dashboard/create/auto-clip?project=${p.id}`}
            className="group rounded-[var(--radius-panel)] border border-line bg-surface-1 overflow-hidden hover:border-primary/40 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            <div className="relative aspect-video bg-surface-3">
              {p.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.coverUrl} alt="" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-fg-subtle"><IcFilm /></span>
              )}
              <span className="absolute bottom-2 left-2 rounded-full bg-bg/80 px-2 py-0.5 text-[11px] font-semibold text-fg">
                {t("clipCount", { count: p._count.clips })}
              </span>
            </div>
            <div className="p-3 space-y-1.5">
              <p className="text-sm font-semibold text-fg truncate">{p.title}</p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-fg-subtle truncate">
                  {format.dateTime(new Date(p.createdAt), { day: "numeric", month: "short" })}
                </span>
                {p.status !== "completed" && <ProjectStatusChip project={p} />}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ── Top clips ────────────────────────────────────────────────────────────────

export function TopClipsRow({ clips }: { clips: ClipRow[] }) {
  const t = useTranslations("Dashboard");
  if (clips.length === 0) return null;
  return (
    <section className="space-y-4">
      <SectionHeader title={t("home.topClips")} action={{ label: t("home.viewAll"), href: "/dashboard/clips" }} />
      <div className="flex gap-3 overflow-x-auto snap-x -mx-4 px-4 sm:mx-0 sm:px-0 pb-2">
        {clips.map((c) => {
          const duration = fmtDuration(c.durationSec);
          const title = c.title ?? t("home.untitledClip", { n: c.index + 1 });
          return (
            <div key={c.id} className="group relative snap-start flex-shrink-0 w-[150px] sm:w-[168px]">
              <Link
                href={`/dashboard/create/auto-clip?project=${c.projectId}&clip=${c.id}`}
                className="block rounded-2xl border border-line bg-surface-3 overflow-hidden aspect-[9/16] hover:border-primary/40 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
              >
                {c.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                )}
                <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-bg/90 to-transparent pointer-events-none" />
                {typeof c.score === "number" && (
                  <span className={`absolute top-2 left-2 rounded-full bg-bg/80 px-2 py-0.5 text-xs font-bold tabular-nums ${scoreTone(c.score)}`}>
                    {c.score}
                  </span>
                )}
                {duration && (
                  <span className="absolute top-2 right-2 rounded-full bg-bg/80 px-1.5 py-0.5 text-[10px] font-semibold text-fg tabular-nums">{duration}</span>
                )}
                <span className="absolute inset-x-2.5 bottom-2.5 text-xs font-semibold text-fg line-clamp-2 leading-snug">{title}</span>
              </Link>
              {c.videoUrl && (
                <a
                  href={c.videoUrl}
                  download
                  aria-label={t("home.downloadClip", { title })}
                  className="absolute top-9 right-2 w-7 h-7 rounded-full bg-bg/80 text-fg flex items-center justify-center opacity-100 sm:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                >
                  <IcDownload />
                </a>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── AI Tools strip ───────────────────────────────────────────────────────────

export function AiToolsStrip() {
  const t = useTranslations("Dashboard");
  return (
    <section className="space-y-4">
      <SectionHeader title={t("home.aiTools")} action={{ label: t("home.exploreTools"), href: "/dashboard/tools" }} />
      <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6 gap-3">
        {HOME_TOOLS.map((tool) => (
          <Link
            key={tool.slug}
            href={tool.href}
            onClick={() => recordRecentTool(tool.slug)}
            className="flex items-center gap-3 rounded-2xl border border-line bg-surface-1 px-3.5 py-3 hover:border-primary/40 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            <span className="w-9 h-9 rounded-xl bg-surface-3 border border-line text-primary flex items-center justify-center flex-shrink-0">
              <ToolIcon name={tool.icon} />
            </span>
            <span className="text-[13px] font-medium text-fg leading-tight">{tool.title}</span>
          </Link>
        ))}
      </div>
      <Link
        href="/dashboard/tools"
        className="sm:hidden flex items-center justify-center gap-1.5 text-[13px] font-semibold text-primary"
      >
        {t("home.exploreTools")} <IcArrow />
      </Link>
    </section>
  );
}

export function HomeEmptyState() {
  const t = useTranslations("Dashboard");
  return (
    <section className="rounded-[var(--radius-panel)] border border-dashed border-line bg-surface-1 px-6 py-10 text-center">
      <span className="mx-auto w-12 h-12 rounded-2xl bg-surface-3 border border-line text-primary flex items-center justify-center"><IcFilm /></span>
      <h2 className="mt-4 text-base font-semibold text-fg">{t("home.emptyTitle")}</h2>
      <p className="mt-1.5 text-sm text-fg-muted max-w-md mx-auto leading-relaxed">{t("home.emptySubtitle")}</p>
    </section>
  );
}
