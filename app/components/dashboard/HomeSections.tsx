"use client";

// Home's sections under the launch box: tool chips into the AI Tools hub,
// recent AutoClip runs, the best clips they produced, and what's new. Each
// list renders nothing until it has something to show — an empty dashboard is
// one empty state on the page, not four.

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { HOME_TOOLS, type AppToolGroup } from "@/app/components/featureLinks";
import { ToolIcon } from "@/app/components/toolIcons";
import { recordRecentTool } from "@/app/components/dashboard/recentTools";
import type { ProjectRow } from "@/app/dashboard/clips/components/projectUi";
import type { ClipRow } from "@/app/dashboard/clips/hooks/useClipsLibrary";

const IcFilm = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6" aria-hidden="true"><rect x="2" y="3" width="20" height="18" rx="2" /><path d="M7 3v18M17 3v18M2 9h5M2 15h5M17 9h5M17 15h5" /></svg>;
const IcDownload = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>;
const IcArrow = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7" /></svg>;

function fmtDuration(sec: number | null | undefined): string | null {
  if (sec == null || !Number.isFinite(sec)) return null;
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function scoreTone(score: number): string {
  if (score >= 85) return "text-primary";
  if (score >= 70) return "text-success";
  return "text-fg-muted";
}

/** Grey label + optional "View all", the section header on this page. */
function RowHeader({ title, href, linkLabel }: { title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3.5 flex items-baseline justify-between gap-3 px-1.5">
      <h2 className="text-base font-medium text-fg-muted">{title}</h2>
      {href && linkLabel && (
        <Link href={href} className="text-[13px] font-semibold text-primary hover:text-primary-hover">{linkLabel}</Link>
      )}
    </div>
  );
}

// ── Tool chips ───────────────────────────────────────────────────────────────

const GROUP_TINT: Record<AppToolGroup, string> = {
  video: "text-primary",
  audio: "text-info",
  image: "text-warning",
  writing: "text-success",
  free: "text-fg-muted",
};

export function ToolChips() {
  const t = useTranslations("Dashboard");
  return (
    <nav aria-label={t("home.aiTools")} className="mx-auto flex max-w-[820px] flex-wrap justify-center gap-2.5">
      {HOME_TOOLS.map((tool) => (
        <Link
          key={tool.slug}
          href={tool.href}
          onClick={() => recordRecentTool(tool.slug)}
          className="inline-flex h-[38px] items-center gap-2 rounded-xl border border-fg/12 px-3.5 text-sm font-medium text-fg hover:border-primary/40 hover:bg-surface-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
        >
          <span className={GROUP_TINT[tool.appGroup ?? "free"]}><ToolIcon name={tool.icon} className="w-4 h-4" /></span>
          {tool.title}
        </Link>
      ))}
      <Link
        href="/dashboard/tools"
        className="inline-flex h-[38px] items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold text-primary hover:text-primary-hover outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
      >
        {t("home.allTools")} <IcArrow />
      </Link>
    </nav>
  );
}

// ── Recent projects ──────────────────────────────────────────────────────────

export function RecentProjects({ projects }: { projects: ProjectRow[] }) {
  const t = useTranslations("Dashboard");
  const format = useFormatter();
  if (projects.length === 0) return null;
  return (
    <section>
      <RowHeader title={t("home.recentProjects")} href="/dashboard/clips" linkLabel={t("home.viewAll")} />
      <div className="grid grid-cols-1 min-[480px]:grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3 sm:gap-4">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/dashboard/create/auto-clip?project=${p.id}`}
            className="group relative block aspect-[16/8.4] overflow-hidden rounded-2xl border border-line bg-surface-3 hover:border-primary/40 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            {p.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.coverUrl} alt="" className="h-full w-full object-cover group-hover:scale-[1.02] transition-transform" />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center pb-10 text-fg-subtle"><IcFilm /></span>
            )}
            <span className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-bg/95 via-bg/50 to-transparent" />
            {p.status === "failed" ? (
              <span className="absolute right-3 top-3 rounded-lg bg-error/25 px-2 py-0.5 text-xs font-semibold text-error">{t("home.failed")}</span>
            ) : typeof p.bestScore === "number" ? (
              <span className="absolute right-3 top-3 rounded-lg bg-bg/80 px-2 py-0.5 text-xs font-bold text-primary">{t("home.bestScore", { score: p.bestScore })}</span>
            ) : null}
            <span className="absolute inset-x-4 bottom-3.5">
              <span className="block truncate text-sm font-semibold text-fg">{p.title}</span>
              <span className="mt-0.5 block text-xs text-fg-muted">
                {t("clipCount", { count: p._count.clips })} · {format.dateTime(new Date(p.createdAt), { day: "numeric", month: "short" })}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ── Top clips ────────────────────────────────────────────────────────────────

export function TopClips({ clips }: { clips: ClipRow[] }) {
  const t = useTranslations("Dashboard");
  if (clips.length === 0) return null;
  return (
    <section>
      <RowHeader title={t("home.topClips")} href="/dashboard/clips" linkLabel={t("home.viewAll")} />
      {/* A scroll row on phones, a wrapping grid from sm up. */}
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 snap-x sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(168px,1fr))] sm:gap-3.5 sm:overflow-visible sm:px-0 sm:pb-0">
        {clips.map((c) => {
          const duration = fmtDuration(c.durationSec);
          const title = c.title ?? t("home.untitledClip", { n: c.index + 1 });
          return (
            <div key={c.id} className="group relative w-[136px] flex-shrink-0 snap-start sm:w-auto">
              <Link
                href={`/dashboard/create/auto-clip?project=${c.projectId}&clip=${c.id}`}
                className="block aspect-[9/16] overflow-hidden rounded-2xl border border-line bg-surface-3 hover:border-primary/40 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
              >
                {c.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                )}
                <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 rounded-b-2xl bg-gradient-to-t from-bg/90 to-transparent" />
                {typeof c.score === "number" && (
                  <span className={`absolute left-2.5 top-2.5 rounded-[10px] bg-bg/80 px-2 py-0.5 text-[13px] font-bold tabular-nums ${scoreTone(c.score)}`}>
                    {c.score}
                  </span>
                )}
                {duration && (
                  <span className="absolute right-2.5 top-2.5 rounded-lg bg-bg/80 px-1.5 py-0.5 text-[11px] text-fg tabular-nums">{duration}</span>
                )}
                <span className="absolute inset-x-3 bottom-3 line-clamp-2 text-[13px] font-semibold leading-snug text-fg">{title}</span>
              </Link>
              {c.videoUrl && (
                <a
                  href={c.videoUrl}
                  download
                  aria-label={t("home.downloadClip", { title })}
                  className="absolute right-2.5 top-10 flex h-7 w-7 items-center justify-center rounded-full bg-bg/80 text-fg opacity-100 sm:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
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

// ── What's new ───────────────────────────────────────────────────────────────

// Real, shipped features only — this is an announcement shelf, not a roadmap.
// The badge is optional; the tone keys the card's tint.
const WHATS_NEW: { key: "aiTools" | "dubbing" | "socialTracker"; href: string; badge?: "new"; tone: string }[] = [
  { key: "aiTools", href: "/dashboard/tools", badge: "new", tone: "bg-primary/[0.07]" },
  { key: "dubbing", href: "/dashboard/clips", tone: "bg-info/[0.08]" },
  { key: "socialTracker", href: "/dashboard/social-tracker", tone: "bg-warning/[0.07]" },
];

export function WhatsNew() {
  const t = useTranslations("Dashboard");
  return (
    <section>
      <RowHeader title={t("home.whatsNew")} />
      <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3 sm:gap-4">
        {WHATS_NEW.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={`relative flex aspect-[16/7] sm:aspect-[16/8.4] flex-col justify-end overflow-hidden rounded-2xl border border-line ${item.tone} p-4 sm:p-[18px] hover:border-primary/40 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70`}
          >
            {item.badge && (
              <span className="absolute right-3 top-3 rounded-lg bg-bg/75 px-2.5 py-0.5 text-xs font-semibold text-fg">{t("home.newBadge")}</span>
            )}
            <span className="text-[17px] font-bold text-fg">{t(`home.news.${item.key}.title`)}</span>
            <span className="mt-1 text-[13px] text-fg-muted">{t(`home.news.${item.key}.desc`)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function HomeEmptyState() {
  const t = useTranslations("Dashboard");
  return (
    <section className="rounded-2xl border border-dashed border-line bg-surface-1 px-6 py-10 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-surface-3 text-primary"><IcFilm /></span>
      <h2 className="mt-4 text-base font-semibold text-fg">{t("home.emptyTitle")}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-fg-muted">{t("home.emptySubtitle")}</p>
    </section>
  );
}
