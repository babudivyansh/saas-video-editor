"use client";

// Admin → Users → [user] → Journey: where the user came from, what they have
// done in total, and everything they did, newest first
// (GET /api/admin/users/:id/activity → lib/admin/user-activity.ts).

import { useInfiniteQuery } from "@tanstack/react-query";
import { Card } from "@/app/components/ui/Card";
import { Button } from "@/app/components/ui/Button";

type Tone = "neutral" | "success" | "warning" | "error";

interface ActivityItem {
  id: string;
  at: string;
  kind: string;
  title: string;
  detail?: string;
  tone: Tone;
}

interface Summary {
  attribution: {
    method: "email" | "google";
    intendedUse: string | null;
    referralCode: string | null;
    utm: { source: string; medium: string; campaign: string } | null;
    country: string | null;
    device: string | null;
  } | null;
  signedUpAt: string | null;
  lastLoginAt: string | null;
  logins: number;
  uploads: number;
  autoClipRuns: number;
  autoClipReady: number;
  autoClipFailed: number;
  clips: number;
  firstRunAt: string | null;
  toolUses: number;
  toolFailures: number;
  downloads: number;
  paidTotalInPaise: number;
  payments: number;
}

interface Page {
  items: ActivityItem[];
  nextBefore: string | null;
  summary?: Summary;
}

const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

const DOT: Record<Tone, string> = {
  neutral: "bg-fg-subtle",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
};

function hoursBetween(a: string | null, b: string | null): string | null {
  if (!a || !b) return null;
  const h = (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
  if (h < 0) return null;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`;
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="bg-surface-2 rounded-lg p-2.5">
      <p className="text-xs text-fg-subtle">{label}</p>
      <p className="font-bold text-fg">{value}</p>
      {hint && <p className="text-[11px] text-fg-subtle">{hint}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 border-t border-line first:border-0">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="text-fg text-right break-all">{value || "—"}</dd>
    </div>
  );
}

export function UserJourney({ userId, headers }: { userId: string; headers: () => Record<string, string> }) {
  const q = useInfiniteQuery({
    queryKey: ["admin-user-activity", userId],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const qs = pageParam ? `?before=${encodeURIComponent(pageParam)}` : "";
      const res = await fetch(`/api/admin/users/${userId}/activity${qs}`, { headers: headers() });
      if (!res.ok) throw new Error("Failed to load activity");
      return (await res.json()) as Page;
    },
    getNextPageParam: (last) => last.nextBefore,
  });

  if (q.isError) {
    return (
      <Card shadow padding="md">
        <p className="text-sm text-error mb-3">Couldn&apos;t load this user&apos;s activity.</p>
        <Button size="sm" variant="secondary" onClick={() => q.refetch()}>Retry</Button>
      </Card>
    );
  }
  if (q.isLoading || !q.data) {
    return <div className="animate-pulse grid grid-cols-1 lg:grid-cols-3 gap-5"><div className="h-64 bg-surface-3 rounded-2xl" /><div className="h-96 bg-surface-3 rounded-2xl lg:col-span-2" /></div>;
  }

  const s = q.data.pages[0]?.summary;
  const a = s?.attribution;
  const items = q.data.pages.flatMap((p) => p.items);
  const toFirstRun = s ? hoursBetween(s.signedUpAt, s.firstRunAt) : null;
  const campaign = a?.utm ? [a.utm.source, a.utm.medium, a.utm.campaign].filter(Boolean).join(" / ") : null;

  // Group the timeline by day, keeping newest-first order.
  const groups: { day: string; items: ActivityItem[] }[] = [];
  for (const it of items) {
    const d = day(it.at);
    const last = groups[groups.length - 1];
    if (last?.day === d) last.items.push(it);
    else groups.push({ day: d, items: [it] });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
      <div className="space-y-5">
        <Card shadow padding="md">
          <h2 className="text-sm font-bold text-fg mb-2">Where they came from</h2>
          <dl className="text-sm">
            <Row label="Signed up" value={dt(s?.signedUpAt ?? null)} />
            <Row label="With" value={a ? (a.method === "google" ? "Google" : "Email") : null} />
            <Row label="Makes" value={a?.intendedUse} />
            <Row label="Campaign" value={campaign} />
            <Row label="Referral code" value={a?.referralCode} />
            <Row label="Country (from IP)" value={a?.country} />
            <Row label="First device" value={a?.device} />
          </dl>
          <p className="text-[11px] text-fg-subtle mt-2">
            Campaign and referral are recorded from 19 Nov 2026; older signups show “—”.
          </p>
        </Card>

        {s && (
          <Card shadow padding="md">
            <h2 className="text-sm font-bold text-fg mb-2">Totals</h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Stat label="AutoClip runs" value={s.autoClipRuns} hint={`${s.autoClipReady} finished · ${s.autoClipFailed} failed`} />
              <Stat label="Clips made" value={s.clips} />
              <Stat label="First run" value={toFirstRun ? `${toFirstRun} after signup` : "Never"} />
              <Stat label="Uploads" value={s.uploads} />
              <Stat label="AI tool uses" value={s.toolUses} hint={s.toolFailures ? `${s.toolFailures} failed` : undefined} />
              <Stat label="Downloads" value={s.downloads} hint="since 19 Nov 2026" />
              <Stat label="Logins" value={s.logins} hint={`last ${dt(s.lastLoginAt)}`} />
              <Stat label="Paid (INR)" value={`₹${(s.paidTotalInPaise / 100).toLocaleString("en-IN")}`} hint={`${s.payments} payment${s.payments === 1 ? "" : "s"}`} />
            </div>
          </Card>
        )}
      </div>

      <Card shadow padding="md" className="lg:col-span-2">
        <h2 className="text-sm font-bold text-fg mb-1">Timeline</h2>
        <p className="text-xs text-fg-subtle mb-3">Signups, logins, uploads, AutoClip runs, AI tools, downloads and payments, newest first.</p>
        {items.length === 0 ? (
          <p className="text-sm text-fg-subtle">Nothing recorded yet.</p>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <section key={g.day}>
                <h3 className="text-xs font-semibold text-fg-muted mb-1.5">{g.day}</h3>
                <ol className="space-y-1.5">
                  {g.items.map((it) => (
                    <li key={it.id} className="flex gap-3 text-sm">
                      <span className="text-xs text-fg-subtle w-12 shrink-0 pt-0.5 tabular-nums">
                        {new Date(it.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${DOT[it.tone]}`} aria-hidden />
                      <span className="min-w-0">
                        <span className="text-fg break-words">{it.title}</span>
                        {it.detail && <span className="block text-xs text-fg-subtle break-words">{it.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}
        {q.hasNextPage && (
          <Button size="sm" variant="secondary" className="mt-4" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
            Load older activity
          </Button>
        )}
      </Card>
    </div>
  );
}
