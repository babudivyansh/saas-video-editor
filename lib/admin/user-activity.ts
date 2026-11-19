// One user's activity, for Admin → Users → [user]. Read from the tables that
// already record each thing — logins, uploads, AutoClip runs, AI tool use,
// payments, subscription changes — plus UserEvent for the few things nothing
// else stores (lib/user-events.ts). Reading the source tables, rather than
// copying them into an event log, means the timeline covers every user's
// whole history, including everything from before this page existed.

import { prisma } from "@/lib/prisma";
import { AUTOCLIP, RUN_READY_STATUSES } from "@/lib/admin/staff-digest";

export type ActivityKind =
  | "signup"
  | "login"
  | "upload"
  | "autoclip_started"
  | "autoclip_ready"
  | "autoclip_failed"
  | "tool"
  | "payment"
  | "subscription"
  | "download";

export interface ActivityItem {
  /** Stable across pages, for React keys. */
  id: string;
  at: string;
  kind: ActivityKind;
  title: string;
  detail?: string;
  tone: "neutral" | "success" | "warning" | "error";
  /** Admin-relative link, when there is somewhere useful to go. */
  href?: string;
}

const SUB_LABELS: Record<string, { title: string; tone: ActivityItem["tone"] }> = {
  trial_started: { title: "Started a free trial", tone: "success" },
  activated: { title: "Subscription activated", tone: "success" },
  charged: { title: "Subscription renewed", tone: "success" },
  payment_failed: { title: "Renewal payment failed", tone: "error" },
  pending: { title: "Renewal pending", tone: "warning" },
  halted: { title: "Subscription halted", tone: "error" },
  cancelled: { title: "Subscription cancelled", tone: "warning" },
  paused: { title: "Subscription paused", tone: "warning" },
  resumed: { title: "Subscription resumed", tone: "success" },
};

function money(minor: number, currency: string): string {
  const symbol = currency === "INR" ? "₹" : currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${(minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function mb(bytes: bigint): string {
  return `${(Number(bytes) / 1_048_576).toFixed(1)} MB`;
}

function minutes(sec: number | null): string | null {
  if (!sec) return null;
  return sec >= 60 ? `${Math.round(sec / 60)} min` : `${Math.round(sec)} s`;
}

const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ");

export interface TimelinePage {
  items: ActivityItem[];
  /** Pass back as `before` for the next page; null when there is no more. */
  nextBefore: string | null;
}

/**
 * Newest first. Each source is asked for `limit` rows older than `before`, the
 * merge keeps the newest `limit`, and `nextBefore` is the oldest kept — so a
 * source can never skip rows between pages.
 */
export async function getUserTimeline(userId: string, opts: { limit?: number; before?: Date } = {}): Promise<TimelinePage> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const before = opts.before ?? new Date(Date.now() + 60_000);
  const at = { lt: before };

  const [user, logins, uploads, runs, generations, purchases, subEvents, events] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true, hasPassword: true, intendedUse: true } }),
    prisma.loginEvent.findMany({ where: { userId, createdAt: at }, orderBy: { createdAt: "desc" }, take: limit, select: { id: true, createdAt: true, device: true, country: true } }),
    prisma.asset.findMany({
      where: { userId, createdAt: at, sourceFeature: { in: ["upload", "url-import"] } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, createdAt: true, name: true, kind: true, size: true, duration: true, sourceFeature: true },
    }),
    prisma.project.findMany({
      // A run can appear twice (started, then finished/failed), so look at
      // runs touched before the cursor and filter each half below.
      where: { userId, productType: AUTOCLIP, OR: [{ createdAt: at }, { updatedAt: at }] },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true, title: true, status: true, failureReason: true, createdAt: true, updatedAt: true,
        _count: { select: { clips: true } },
      },
    }),
    prisma.generation.findMany({
      where: { userId, createdAt: at },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, createdAt: true, toolSlug: true, modelId: true, status: true, creditsCost: true, errorMessage: true },
    }),
    prisma.purchase.findMany({
      where: { userId, createdAt: at },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, createdAt: true, amountInPaise: true, currency: true, status: true, minutes: true, credits: true, plan: { select: { name: true } } },
    }),
    prisma.subscriptionEvent.findMany({
      where: { userId, createdAt: at },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, createdAt: true, type: true, reason: true },
    }),
    prisma.userEvent.findMany({
      where: { userId, createdAt: at },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, createdAt: true, type: true, meta: true },
    }),
  ]);

  const items: ActivityItem[] = [];
  const signupMeta = events.find((e) => e.type === "signup")?.meta as { referralCode?: string } | null | undefined;

  if (user && user.createdAt < before) {
    items.push({
      id: `signup:${userId}`,
      at: user.createdAt.toISOString(),
      kind: "signup",
      title: `Signed up with ${user.hasPassword ? "email" : "Google"}`,
      detail: join(user.intendedUse && `Makes: ${user.intendedUse}`, signupMeta?.referralCode && `Referral ${signupMeta.referralCode}`) || undefined,
      tone: "success",
    });
  }
  for (const l of logins) {
    items.push({ id: `login:${l.id}`, at: l.createdAt.toISOString(), kind: "login", title: "Logged in", detail: join(l.device, l.country) || undefined, tone: "neutral" });
  }
  for (const a of uploads) {
    items.push({
      id: `upload:${a.id}`,
      at: a.createdAt.toISOString(),
      kind: "upload",
      title: `${a.sourceFeature === "url-import" ? "Imported" : "Uploaded"} ${a.kind}: ${a.name}`,
      detail: join(mb(a.size), minutes(a.duration)),
      tone: "neutral",
    });
  }
  for (const r of runs) {
    if (r.createdAt < before) {
      items.push({ id: `run:${r.id}`, at: r.createdAt.toISOString(), kind: "autoclip_started", title: `Started AutoClip: ${r.title}`, tone: "neutral" });
    }
    if (r.updatedAt < before && RUN_READY_STATUSES.includes(r.status)) {
      items.push({
        id: `run-ready:${r.id}`,
        at: r.updatedAt.toISOString(),
        kind: "autoclip_ready",
        title: `AutoClip finished: ${r._count.clips} clip${r._count.clips === 1 ? "" : "s"}`,
        detail: r.title,
        tone: "success",
      });
    } else if (r.updatedAt < before && r.status === "failed") {
      items.push({ id: `run-failed:${r.id}`, at: r.updatedAt.toISOString(), kind: "autoclip_failed", title: "AutoClip failed", detail: join(r.title, r.failureReason), tone: "error" });
    }
  }
  for (const g of generations) {
    const failed = g.status === "failed" || g.status === "refunded";
    items.push({
      id: `gen:${g.id}`,
      at: g.createdAt.toISOString(),
      kind: "tool",
      title: `Used ${g.toolSlug}${failed ? " (failed)" : ""}`,
      detail: join(g.modelId, `${g.creditsCost} credit${g.creditsCost === 1 ? "" : "s"}`, failed && g.errorMessage?.slice(0, 140)),
      tone: failed ? "error" : "neutral",
    });
  }
  for (const p of purchases) {
    const refunded = p.status !== "captured";
    items.push({
      id: `purchase:${p.id}`,
      at: p.createdAt.toISOString(),
      kind: "payment",
      title: `Paid ${money(p.amountInPaise, p.currency)}${refunded ? ` (${p.status.replace(/_/g, " ")})` : ""}`,
      detail: join(p.plan?.name ?? "Top-up", p.minutes > 0 && `${p.minutes} min`, p.credits > 0 && `${p.credits} credits`, p.id),
      tone: refunded ? "warning" : "success",
    });
  }
  for (const s of subEvents) {
    const label = SUB_LABELS[s.type] ?? { title: `Subscription: ${s.type}`, tone: "neutral" as const };
    items.push({ id: `sub:${s.id}`, at: s.createdAt.toISOString(), kind: "subscription", title: label.title, detail: s.reason ?? undefined, tone: label.tone });
  }
  for (const e of events) {
    if (e.type !== "download") continue;
    const meta = e.meta as { name?: string; area?: string } | null;
    items.push({ id: `ev:${e.id}`, at: e.createdAt.toISOString(), kind: "download", title: `Downloaded ${meta?.name ?? "a file"}`, detail: meta?.area, tone: "neutral" });
  }

  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : -1));
  const page = items.slice(0, limit);
  // More may exist if anything was cut, or if any source returned a full page.
  const sourcesFull = [logins, uploads, runs, generations, purchases, subEvents, events].some((rows) => rows.length === limit);
  const more = items.length > limit || sourcesFull;
  return { items: page, nextBefore: more && page.length ? page[page.length - 1].at : null };
}

export interface SignupAttribution {
  method: "email" | "google";
  intendedUse: string | null;
  referralCode: string | null;
  utm: { source: string; medium: string; campaign: string } | null;
  /** Referring host at first visit ("direct" when none) — User.signupReferrer. */
  referrer: string | null;
  /** First path landed on — User.signupLandingPath. */
  landingPath: string | null;
  /** From the first recorded login (signup signs the user in). Approximate, IP-based. */
  country: string | null;
  device: string | null;
}

export interface ActivitySummary {
  attribution: SignupAttribution | null;
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

function parseSignupSource(v: string | null): SignupAttribution["utm"] {
  if (!v) return null;
  const [source = "", medium = "", campaign = ""] = v.split("/");
  return source || medium || campaign ? { source, medium, campaign } : null;
}

export async function getUserActivitySummary(userId: string): Promise<ActivitySummary> {
  const [user, logins, uploads, runsByStatus, firstRun, clips, gens, genFails, downloads, paid, signup, firstLogin] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: {
      createdAt: true, lastLoginAt: true, hasPassword: true, intendedUse: true,
      signupSource: true, signupReferrer: true, signupLandingPath: true,
    } }),
    prisma.loginEvent.count({ where: { userId } }),
    prisma.asset.count({ where: { userId, sourceFeature: { in: ["upload", "url-import"] } } }),
    prisma.project.groupBy({ by: ["status"], where: { userId, productType: AUTOCLIP }, _count: { _all: true } }),
    prisma.project.findFirst({ where: { userId, productType: AUTOCLIP }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.clip.count({ where: { project: { userId, productType: AUTOCLIP } } }),
    prisma.generation.count({ where: { userId } }),
    prisma.generation.count({ where: { userId, status: { in: ["failed", "refunded"] } } }),
    prisma.userEvent.count({ where: { userId, type: "download" } }),
    prisma.purchase.aggregate({ where: { userId, status: "captured", currency: "INR" }, _sum: { amountInPaise: true }, _count: { _all: true } }),
    prisma.userEvent.findFirst({ where: { userId, type: "signup" }, select: { meta: true } }),
    prisma.loginEvent.findFirst({ where: { userId }, orderBy: { createdAt: "asc" }, select: { country: true, device: true } }),
  ]);
  const meta = (signup?.meta ?? {}) as { referralCode?: string; utm?: SignupAttribution["utm"] };
  const runCount = (pred: (s: string) => boolean) => runsByStatus.filter((r) => pred(r.status)).reduce((n, r) => n + r._count._all, 0);
  return {
    attribution: user
      ? {
          method: user.hasPassword ? "email" : "google",
          intendedUse: user.intendedUse,
          referralCode: meta.referralCode ?? null,
          // UserEvent's UTM first; User.signupSource ("source/medium/campaign") covers
          // signups recorded by the attribution code before UserEvent existed.
          utm: meta.utm ?? parseSignupSource(user.signupSource),
          referrer: user.signupReferrer,
          landingPath: user.signupLandingPath,
          country: firstLogin?.country ?? null,
          device: firstLogin?.device ?? null,
        }
      : null,
    signedUpAt: user?.createdAt.toISOString() ?? null,
    lastLoginAt: user?.lastLoginAt?.toISOString() ?? null,
    logins,
    uploads,
    autoClipRuns: runCount(() => true),
    autoClipReady: runCount((s) => RUN_READY_STATUSES.includes(s)),
    autoClipFailed: runCount((s) => s === "failed"),
    clips,
    firstRunAt: firstRun?.createdAt.toISOString() ?? null,
    toolUses: gens,
    toolFailures: genFails,
    downloads,
    paidTotalInPaise: paid._sum.amountInPaise ?? 0,
    payments: paid._count._all,
  };
}
