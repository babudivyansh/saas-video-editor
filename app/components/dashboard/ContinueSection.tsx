"use client";

// Home's "Continue where you left off": the most recently touched project as
// a large card with its actions on it, the rest queued beside it.

import Link from "next/link";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { ProjectStatusChip } from "@/app/dashboard/clips/components/projectUi";

export interface ContinueProject {
  id: string;
  title: string;
  status: string;
  progress: number;
  productType: string;
  createdAt: string;
  updatedAt: string;
  clipCount: number;
}

interface ContinueSectionProps {
  projects: ContinueProject[];
  /** Everything that could be shown, so we know when to offer "view all". */
  total: number;
  hrefFor: (p: ContinueProject) => string;
  onRename: (p: ContinueProject) => void;
  onDelete: (p: ContinueProject) => void;
  onMenu: (e: React.MouseEvent, p: ContinueProject) => void;
}

const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const IcChevron = () => <svg {...svg} strokeWidth={2} className="w-4 h-4"><path d="M9 18l6-6-6-6" /></svg>;
const IcPlay = () => <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M8 5l11 7-11 7z" /></svg>;
const IcClock = () => <svg {...svg} className="w-3.5 h-3.5"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
const IcRename = () => <svg {...svg} className="w-4 h-4"><path d="M4 7V5h16v2M12 5v14M9 19h6" /></svg>;
const IcTrash = () => <svg {...svg} className="w-4 h-4"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>;
const IcMore = () => <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>;
const IcEditor = () => <svg {...svg} className="w-3 h-3"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M8 5v5M14 5v5" /></svg>;

// A small multi-track timeline drawn in place of a thumbnail — these projects
// have none, and a row of identical film icons told the drafts apart by
// nothing but their titles. Layouts rotate so neighbours differ.
const LAYOUTS: [number, number, boolean][][] = [
  [[0, 62, true], [10, 38, false], [0, 86, false]],
  [[0, 78, true], [22, 30, false], [6, 60, false]],
  [[0, 44, true], [30, 50, false], [0, 70, false]],
  [[0, 90, true], [12, 24, false], [40, 46, false]],
];

function TrackGlyph({ seed, dense }: { seed: number; dense?: boolean }) {
  const tracks = LAYOUTS[seed % LAYOUTS.length];
  return (
    <div aria-hidden="true" className={`absolute inset-0 flex flex-col justify-center ${dense ? "gap-1 p-2" : "gap-2 p-[18px]"}`}>
      {tracks.map(([left, width, hi], i) => (
        <div
          key={i}
          className={`${dense ? "h-1" : "h-2"} rounded-[3px] ${hi ? "bg-primary/55" : "bg-fg/12"}`}
          style={{ marginLeft: `${left}%`, width: `${width}%` }}
        />
      ))}
      <div className={`absolute ${dense ? "top-1 bottom-1" : "top-3.5 bottom-3.5"} w-0.5 rounded bg-primary`} style={{ left: `${38 + (seed % 4) * 9}%` }} />
    </div>
  );
}

export function ContinueSection({ projects, total, hrefFor, onRename, onDelete, onMenu }: ContinueSectionProps) {
  const t = useTranslations("Dashboard");
  const tRail = useTranslations("Nav.rail");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });

  if (projects.length === 0) return null;
  const [first, ...rest] = projects;

  // Editor projects never produce Clip rows — their work lives in editorDoc —
  // so a clip count there is always "0 clips". Show last-touched instead.
  const metaFor = (p: ContinueProject) =>
    p.productType === "editor"
      ? t("editedAgo", { relative: format.relativeTime(new Date(p.updatedAt), now) })
      : t("clipCount", { count: p.clipCount });
  const kindFor = (p: ContinueProject) => (p.productType === "editor" ? tRail("editor") : tRail("autoClip"));

  return (
    <section className="rounded-[var(--radius-panel)] border border-line bg-surface-1 px-5 py-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <h2 className="text-base font-bold text-fg">{t("continueWhereYouLeftOff")}</h2>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-3 text-fg-muted whitespace-nowrap">
            {t("projectCount", { count: total })}
          </span>
        </div>
        <Link href="/dashboard/clips" className="flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary-hover whitespace-nowrap">
          {t("viewAllClips")} <IcChevron />
        </Link>
      </div>

      <div className={`grid gap-5 ${rest.length ? "min-[1700px]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]" : ""}`}>
        {/* Last edited */}
        <article className="flex flex-col sm:flex-row sm:items-center gap-5 rounded-2xl border border-primary/30 bg-surface-2 p-3.5">
          <Link
            href={hrefFor(first)}
            aria-label={first.title}
            className="relative block w-full sm:w-[240px] aspect-video flex-shrink-0 overflow-hidden rounded-xl border border-line bg-surface-3 outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            <TrackGlyph seed={0} />
            <span className="absolute top-2 left-2 inline-flex items-center gap-1 h-[22px] px-2 rounded-full bg-bg/80 text-[11px] font-semibold text-fg-muted">
              <IcEditor /> {kindFor(first)}
            </span>
          </Link>
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">{t("lastEdited")}</span>
            <Link href={hrefFor(first)} className="text-lg font-semibold leading-snug text-fg hover:text-primary line-clamp-2">
              {first.title}
            </Link>
            <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-fg-subtle">
              <span className="inline-flex items-center gap-1.5"><IcClock />{metaFor(first)}</span>
              <ProjectStatusChip project={{ ...first, _count: { clips: first.clipCount } }} />
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Link
                href={hrefFor(first)}
                className="inline-flex items-center gap-2 h-10 px-4 whitespace-nowrap rounded-full grad-brand text-on-primary text-sm font-semibold shadow-glow hover:brightness-105 outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                <IcPlay /> {t("resumeEditing")}
              </Link>
              <button
                type="button"
                onClick={() => onRename(first)}
                className="inline-flex items-center gap-2 h-10 px-4 whitespace-nowrap rounded-full border border-line-strong bg-surface-1 text-sm font-medium text-fg hover:bg-surface-3 transition-colors cursor-pointer"
              >
                <IcRename /> {t("renameProject")}
              </button>
              <button
                type="button"
                onClick={() => onDelete(first)}
                aria-label={`${t("deleteProject")}: ${first.title}`}
                title={t("deleteProject")}
                className="w-10 h-10 rounded-full flex items-center justify-center text-fg-subtle hover:text-error hover:bg-surface-3 transition-colors cursor-pointer"
              >
                <IcTrash />
              </button>
            </div>
          </div>
        </article>

        {/* Up next */}
        {rest.length > 0 && (
          <div className="flex flex-col min-w-0">
            <span className="px-1 pb-2 text-xs font-semibold uppercase tracking-[0.06em] text-fg-subtle">{t("upNext")}</span>
            {rest.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3.5 py-2.5 px-1 border-t border-line first-of-type:border-t-0">
                <Link
                  href={hrefFor(p)}
                  aria-label={p.title}
                  className="relative block w-[84px] aspect-video flex-shrink-0 overflow-hidden rounded-lg border border-line bg-surface-3 outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                >
                  <TrackGlyph seed={i + 1} dense />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={hrefFor(p)} className="block text-sm font-semibold text-fg truncate hover:text-primary">{p.title}</Link>
                  <span className="block text-xs text-fg-subtle mt-0.5 truncate">{metaFor(p)}</span>
                </div>
                <Link
                  href={hrefFor(p)}
                  className="hidden sm:inline-flex items-center h-9 px-3.5 rounded-full border border-line-strong bg-surface-2 text-[13px] font-medium text-fg hover:bg-surface-3 transition-colors"
                >
                  {t("resume")}
                </Link>
                <button
                  type="button"
                  onClick={(e) => onMenu(e, p)}
                  aria-label={`${t("projectActions")}: ${p.title}`}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-fg-subtle hover:text-fg hover:bg-surface-3 transition-colors cursor-pointer flex-shrink-0"
                >
                  <IcMore />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {total > projects.length && (
        <Link href="/dashboard/clips" className="inline-block text-sm font-semibold text-primary hover:text-primary-hover">
          {t("viewAllProjects", { count: total })}
        </Link>
      )}
    </section>
  );
}
