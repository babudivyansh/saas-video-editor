"use client";

// The audit events as a readable timeline: grouped by day, one plain-English
// line per event, severity, actor, target and reason visible without opening
// anything. Used by the Audit Log page and by each account's Activity tab.

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AlertTriangle, ShieldAlert, Trash2, IndianRupee, Lock, Pencil, Eye } from "lucide-react";
import { Button } from "@/app/components/ui/Button";
import { StatusBadge } from "@/app/components/ui/StatusBadge";
import { AuditDrawer } from "./AuditDrawer";
import { dayHeading, relativeTime } from "./format";
import { CATEGORY_LABEL, SEVERITY_LABEL, SEVERITY_TONE, type AuditEvent, type AuditSeverity } from "./types";

const ICON: Record<AuditSeverity, typeof Eye> = {
  critical: ShieldAlert,
  destructive: Trash2,
  money: IndianRupee,
  security: Lock,
  change: Pencil,
  view: Eye,
};
const ICON_TONE: Record<AuditSeverity, string> = {
  critical: "text-error bg-error/10 border-error/25",
  destructive: "text-warning bg-warning/10 border-warning/25",
  money: "text-primary bg-primary/10 border-primary/25",
  security: "text-info bg-info/10 border-info/25",
  change: "text-fg-muted bg-surface-3 border-line",
  view: "text-fg-subtle bg-surface-3 border-line",
};

export function AuditTimeline({
  headers,
  params,
  onFilterTarget,
  emptyText = "No audit entries match these filters.",
}: {
  headers: () => Record<string, string>;
  /** API query (from toParams), without cursor. */
  params: string;
  onFilterTarget?: (targetId: string) => void;
  emptyText?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const q = useInfiniteQuery({
    queryKey: ["admin-audit", params],
    initialPageParam: "",
    queryFn: async ({ pageParam }) => {
      const p = new URLSearchParams(params);
      if (pageParam) p.set("cursor", pageParam);
      const res = await fetch(`/api/admin/audit?${p}`, { headers: headers() });
      if (!res.ok) throw new Error("Failed to load the audit log");
      return (await res.json()) as { events: AuditEvent[]; total: number; nextCursor: string | null };
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const events = q.data?.pages.flatMap((p) => p.events) ?? [];
  const total = q.data?.pages[0]?.total ?? 0;

  if (q.isError) {
    return (
      <p className="text-sm text-error">
        Couldn&apos;t load the audit log. <Button variant="link" className="text-brand" onClick={() => q.refetch()}>Retry</Button>
      </p>
    );
  }
  if (q.isLoading) return <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-16 bg-surface-3 rounded-xl animate-pulse" />)}</div>;
  if (events.length === 0) return <p className="text-sm text-fg-subtle py-8 text-center">{emptyText}</p>;

  // Group consecutive events by local day.
  const groups: Array<{ heading: string; items: AuditEvent[] }> = [];
  for (const e of events) {
    const heading = dayHeading(e.createdAt, now);
    const last = groups[groups.length - 1];
    if (last && last.heading === heading) last.items.push(e);
    else groups.push({ heading, items: [e] });
  }

  return (
    <div>
      <p className="text-xs text-fg-subtle mb-2">{total.toLocaleString()} event{total === 1 ? "" : "s"}</p>
      <div className="space-y-5">
        {groups.map((g) => (
          <section key={g.heading}>
            <h3 className="py-1.5 text-xs font-semibold text-fg-muted">{g.heading}</h3>
            <ul className="rounded-[var(--radius-card)] border border-line divide-y divide-line overflow-hidden">
              {g.items.map((e) => {
                const Icon = ICON[e.severity];
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setOpen(e.id)}
                      className="w-full text-left flex items-start gap-3 px-4 py-3 bg-surface-2 hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                    >
                      <span className={`mt-0.5 shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center ${ICON_TONE[e.severity]}`} aria-hidden>
                        <Icon size={15} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm text-fg">
                          <span className="font-semibold">{e.label}</span>
                          {e.target && <span className={e.target.deleted ? "text-fg-muted" : "text-fg"}> {e.target.label}</span>}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-fg-subtle">
                          <span>
                            {e.actor.type === "admin" ? "by " : e.actor.type === "user" ? "by user " : "by system "}
                            <span className="text-fg-muted">{e.actor.email ?? e.actor.id}</span>
                          </span>
                          <span aria-hidden>·</span>
                          <time dateTime={e.createdAt} title={`${new Date(e.createdAt).toLocaleString()} (${new Date(e.createdAt).toISOString()})`}>
                            {new Date(e.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} · {relativeTime(e.createdAt, now)}
                          </time>
                          {e.ip && <><span aria-hidden>·</span><span className="font-mono">{e.ip}</span></>}
                        </span>
                        {e.reason && <span className="mt-1 block text-xs text-fg-muted truncate">“{e.reason}”</span>}
                      </span>
                      <span className="shrink-0 flex flex-col items-end gap-1">
                        <StatusBadge tone={SEVERITY_TONE[e.severity]}>{SEVERITY_LABEL[e.severity]}</StatusBadge>
                        <span className="hidden sm:block text-[10px] text-fg-subtle">{CATEGORY_LABEL[e.category]}</span>
                        {e.missingReason && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-warning">
                            <AlertTriangle size={11} aria-hidden /> No reason
                          </span>
                        )}
                        {e.integrity === "tampered" && <StatusBadge tone="error">Tampered</StatusBadge>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {q.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" size="sm" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
            Load more ({(total - events.length).toLocaleString()} left)
          </Button>
        </div>
      )}
      <AuditDrawer id={open} headers={headers} onClose={() => setOpen(null)} onFilterTarget={onFilterTarget} />
    </div>
  );
}
