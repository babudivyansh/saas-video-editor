"use client";

// Home's "Start from a demo project": AutoClip runs on the three sample videos
// (a podcast, a gaming video, a vlog), already finished, so a new user sees
// what comes back before running anything. "Try it" opens the demo's clips,
// read-only (/dashboard/demo/<slug>), where "Run AutoClip on this video" does
// it for real. Only demos this environment has are shown (lib/demo-projects.ts).

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAuth } from "@/app/components/AuthContext";
import { getStoredToken } from "@/app/hooks/useVideoGenerate";
import { samplePoster, samplesFor, type SampleId } from "@/lib/sample-projects";
import type { DemoCard } from "@/lib/demo-projects";
import { RowHeader } from "./HomeSections";

export const demoHref = (slug: string) => `/dashboard/demo/${encodeURIComponent(slug)}`;

export function DemoProjects() {
  const t = useTranslations("Dashboard");
  const { user } = useAuth();
  const [demos, setDemos] = useState<DemoCard[] | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;
    let live = true;
    fetch("/api/demo-projects", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : { demos: [] }))
      .then((b: { demos?: DemoCard[] }) => { if (live) setDemos(b.demos ?? []); })
      .catch(() => { if (live) setDemos([]); });
    return () => { live = false; };
  }, []);

  // The demo matching what the user said they make goes first.
  const order = samplesFor(user?.intendedUse).map((s) => s.id);
  const cards = (demos ?? []).slice().sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug));
  if (cards.length === 0) return null;

  return (
    <section>
      <RowHeader title={t("home.demosTitle")} />
      <ul className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:gap-4 md:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
        {cards.map((d) => (
          <li key={d.slug}>
            <Link
              href={demoHref(d.slug)}
              className="group relative block aspect-[16/8.4] overflow-hidden rounded-2xl border border-line bg-surface-3 outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={samplePoster(d.slug as SampleId)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-bg/95 via-bg/50 to-transparent" />
              <span className="absolute left-3 top-3 rounded-lg bg-bg/80 px-2 py-0.5 text-xs font-semibold text-fg">{d.label}</span>
              <span className="absolute inset-x-4 bottom-3.5 flex items-end justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-fg" title={d.title}>{d.title}</span>
                  <span className="mt-0.5 block text-xs text-fg-muted">{t("clipCount", { count: d.clipCount })}</span>
                </span>
                <span className="shrink-0 rounded-full bg-fg px-3.5 py-1.5 text-xs font-semibold text-bg transition-colors group-hover:bg-primary group-hover:text-on-primary">
                  {t("home.tryDemo")}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
