"use client";

// A month at a glance: every post made or planned from Clipiro on its day.
// Days are in the viewer's own timezone, which is the one they plan in.

import { useMemo, useState, useSyncExternalStore } from "react";
import type { PlannedPost } from "./PlannedPosts";

const DOT: Record<PlannedPost["status"], string> = {
  your_turn: "bg-warning",
  scheduled: "bg-brand",
  posting: "bg-brand",
  posted: "bg-success",
  failed: "bg-error",
  missed: "bg-error",
};
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const noop = () => () => {};

/** The grid is in the viewer's timezone, which the server can't know. */
export function PostCalendar({ posts }: { posts: PlannedPost[] }) {
  const client = useSyncExternalStore(noop, () => true, () => false);
  if (!client) return <div className="h-[520px] animate-pulse rounded-[var(--radius-card)] bg-surface-3" aria-label="Loading calendar" />;
  return <Calendar posts={posts} />;
}

function Calendar({ posts }: { posts: PlannedPost[] }) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const byDay = useMemo(() => {
    const map = new Map<string, PlannedPost[]>();
    for (const p of posts) {
      const iso = p.scheduledAt ?? p.publishedAt;
      if (!iso) continue;
      const key = dayKey(new Date(iso));
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return map;
  }, [posts]);

  // Monday-first grid, padded to whole weeks.
  const lead = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const today = dayKey(new Date());

  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

  return (
    <section aria-label="Post calendar" className="rounded-[var(--radius-card)] border border-line bg-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg" suppressHydrationWarning>
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h2>
        <div className="flex gap-1">
          <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="rounded-full px-2.5 py-1 text-sm text-fg-muted hover:bg-surface-3 hover:text-fg">
            ←
          </button>
          <button type="button" onClick={() => shift(1)} aria-label="Next month" className="rounded-full px-2.5 py-1 text-sm text-fg-muted hover:bg-surface-3 hover:text-fg">
            →
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[560px] grid-cols-7 gap-1">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-1.5 pb-1 text-[10px] font-bold uppercase tracking-widest text-fg-subtle">
              {d}
            </div>
          ))}
          {cells.map((day, i) => {
            if (!day) return <div key={`pad-${i}`} className="min-h-[84px] rounded-lg" />;
            const items = byDay.get(dayKey(day)) ?? [];
            const isToday = dayKey(day) === today;
            return (
              <div
                key={dayKey(day)}
                className={`min-h-[84px] rounded-lg border p-1.5 ${isToday ? "border-brand" : "border-line"} bg-surface-2`}
              >
                <p className={`text-[11px] font-semibold ${isToday ? "text-brand" : "text-fg-muted"}`}>{day.getDate()}</p>
                <ul className="mt-1 space-y-1">
                  {items.slice(0, 3).map((p) => (
                    <li key={p.id} className="flex items-center gap-1 text-[11px] text-fg" title={`${p.title} · ${p.account.name}`}>
                      <span aria-hidden="true" className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${DOT[p.status]}`} />
                      <span className="truncate">{p.title}</span>
                    </li>
                  ))}
                  {items.length > 3 && <li className="text-[10px] text-fg-subtle">+{items.length - 3} more</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-fg-muted">
        <span className="flex items-center gap-1"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand" /> Scheduled</span>
        <span className="flex items-center gap-1"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" /> Your turn</span>
        <span className="flex items-center gap-1"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" /> Posted</span>
        <span className="flex items-center gap-1"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-error" /> Failed</span>
      </p>
    </section>
  );
}
