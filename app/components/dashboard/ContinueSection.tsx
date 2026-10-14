"use client";

// Home's "Continue where you left off": in-progress runs as a row of cards,
// the same shape as the page's other rows. Each card is a link with its
// actions menu beside it (a button inside a link is invalid HTML) — the
// menu is how users rename or clear an empty draft.

import Link from "next/link";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { ProjectStatusChip } from "@/app/dashboard/projects/components/projectUi";

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

const IcMore = () => <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>;

// A small multi-track timeline drawn in place of a thumbnail — these projects
// have none, and a row of identical film icons told the drafts apart by
// nothing but their titles. Layouts rotate so neighbours differ.
const LAYOUTS: [number, number, boolean][][] = [
  [[0, 62, true], [10, 38, false], [0, 86, false]],
  [[0, 78, true], [22, 30, false], [6, 60, false]],
  [[0, 44, true], [30, 50, false], [0, 70, false]],
  [[0, 90, true], [12, 24, false], [40, 46, false]],
];

function TrackGlyph({ seed }: { seed: number }) {
  const tracks = LAYOUTS[seed % LAYOUTS.length];
  return (
    <div aria-hidden="true" className="absolute inset-x-0 top-0 bottom-1/3 flex flex-col justify-center gap-2 px-6">
      {tracks.map(([left, width, hi], i) => (
        <div
          key={i}
          className={`h-2 rounded-[3px] ${hi ? "bg-primary/55" : "bg-fg/12"}`}
          style={{ marginLeft: `${left}%`, width: `${width}%` }}
        />
      ))}
      <div className="absolute top-3 bottom-0 w-0.5 rounded bg-primary" style={{ left: `${38 + (seed % 4) * 9}%` }} />
    </div>
  );
}

// onRename / onDelete stay in the props for callers, but both now live in the
// card's actions menu (onMenu).
export function ContinueSection({ projects, total, hrefFor, onMenu }: ContinueSectionProps) {
  const t = useTranslations("Dashboard");
  const tRail = useTranslations("Nav.rail");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });

  if (projects.length === 0) return null;

  // Editor projects never produce Clip rows — their work lives in editorDoc —
  // so a clip count there is always "0 clips". Show last-touched instead.
  const metaFor = (p: ContinueProject) =>
    p.productType === "editor"
      ? t("editedAgo", { relative: format.relativeTime(new Date(p.updatedAt), now) })
      : t("clipCount", { count: p.clipCount });
  const kindFor = (p: ContinueProject) => (p.productType === "editor" ? tRail("editor") : tRail("autoClip"));

  return (
    <section>
      <div className="mb-3.5 flex items-baseline justify-between gap-3 px-1.5">
        <h2 className="text-base font-medium text-fg-muted">{t("continueWhereYouLeftOff")}</h2>
        <Link href="/dashboard/projects" className="text-[13px] font-semibold text-primary hover:text-primary-hover">
          {total > projects.length ? t("viewAllProjects", { count: total }) : t("home.viewAll")}
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
        {projects.map((p, i) => (
          <div key={p.id} className="group relative">
            <Link
              href={hrefFor(p)}
              aria-label={p.title}
              className="relative block aspect-[16/8.4] overflow-hidden rounded-2xl border border-line bg-surface-2 hover:border-primary/40 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              <TrackGlyph seed={i} />
              <span className="absolute left-3 top-3 inline-flex h-[22px] items-center rounded-full bg-bg/80 px-2 text-[11px] font-semibold text-fg-muted">
                {kindFor(p)}
              </span>
              <span className="absolute inset-x-4 bottom-3.5 flex items-end gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-fg">{p.title}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs text-fg-muted">
                    {metaFor(p)}
                    <ProjectStatusChip project={{ ...p, _count: { clips: p.clipCount } }} />
                  </span>
                </span>
                <span className="inline-flex h-8 flex-shrink-0 items-center rounded-full bg-fg px-3 text-[13px] font-semibold text-bg">
                  {t("resume")}
                </span>
              </span>
            </Link>
            <button
              type="button"
              onClick={(e) => onMenu(e, p)}
              aria-label={`${t("projectActions")}: ${p.title}`}
              className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-bg/80 text-fg-muted hover:text-fg transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              <IcMore />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
