import {
  CREDIT_PACKS,
  LANGUAGES,
  MINUTE_PACKS,
  PLANS,
  TOOL_CATALOG,
  YEARLY_DISCOUNT_PCT,
  type Account,
  type AccountSettings,
  type Activity,
  type ActivityPage,
  type HomeSummary,
  type PlansResponse,
  type Tool,
} from "@clipiro/shared";
import { listSessions } from "@/lib/auth";
import { cheapestImageCost } from "@/lib/plans/display";
import { effectivePlan } from "@/lib/plans/effective-plan";
import { getPublicPlans } from "@/lib/plans/public";
import { FREE_TIER_MONTHLY_BONUS_CREDITS, FREE_TIER_MONTHLY_BONUS_MINUTES, STORAGE_LIMIT_GB, TIER_MAX_AUTOCLIP_SOURCE_SECONDS } from "@/lib/plans/tiers";
import { prisma } from "@/lib/prisma";
import { RANKS, TOTAL_XP, earnedXpFor, xpToLevel } from "@/lib/quest-config";
import { startedResumableWhere } from "@/lib/project-activity";
import { resignMediaUrl } from "@/lib/signed-media";
import { resignOwnedMediaUrl } from "@/lib/source-url";
import { TOOL_COSTS } from "@/lib/tool-costs";
import { getAllToolConfigs } from "@/lib/tool-config";

// What /api/mobile/v1/me, /home, /plans and /tools answer, built from the same
// helpers the web dashboard, billing page and tools page use.

const DEFAULT_REFERRAL_PERCENT = 20; // Affiliate.commissionRate's default

/** Quest XP → level and the XP the next level starts at (the top level is its own ceiling). */
async function creatorLevel(userId: string) {
  const done = await prisma.userQuest.findMany({ where: { userId }, select: { questId: true } });
  const xp = earnedXpFor(done.map((q) => q.questId));
  const next = RANKS.find((r) => r.minXp > xp);
  return { level: xpToLevel(xp), xp, nextLevelXp: next?.minXp ?? TOTAL_XP };
}

async function referralPercent(userId: string) {
  const a = await prisma.affiliate.findUnique({ where: { userId }, select: { commissionRate: true } });
  return Math.round((a?.commissionRate ?? DEFAULT_REFERRAL_PERCENT / 100) * 100);
}

export async function buildAccount(userId: string): Promise<Account | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      hasPassword: true,
      credits: true,
      minutes: true,
      monthlyCredits: true,
      monthlyMinutes: true,
      subscriptionEndsAt: true,
      subscriptionCancelledAt: true,
      plan: { select: { name: true, tier: true, intervalMonths: true } },
    },
  });
  if (!user) return null;
  const plan = effectivePlan(user);
  const paid = plan.tier !== "free";
  const [creator, unread, sessions, referral] = await Promise.all([
    creatorLevel(userId),
    prisma.notification.count({ where: { userId, readAt: null } }),
    listSessions(userId),
    referralPercent(userId),
  ]);
  return {
    user: { id: user.id, name: user.name ?? "", email: user.email, avatarUrl: await resignOwnedMediaUrl(user.avatarUrl, user.id), hasPassword: user.hasPassword },
    plan: {
      tier: plan.tier,
      term: paid ? ((user.plan?.intervalMonths ?? 1) >= 12 ? "yearly" : "monthly") : null,
      renewsAt: paid && user.subscriptionEndsAt ? user.subscriptionEndsAt.toISOString() : null,
      cancelAtPeriodEnd: paid && !!user.subscriptionCancelledAt,
    },
    creator,
    clipMinutes: { remaining: Math.max(0, user.minutes), allowance: paid ? user.monthlyMinutes : FREE_TIER_MONTHLY_BONUS_MINUTES },
    aiCredits: { remaining: Math.max(0, user.credits), allowance: paid ? user.monthlyCredits : FREE_TIER_MONTHLY_BONUS_CREDITS },
    unreadNotifications: unread,
    activeSessions: sessions.length,
    referralPercent: referral,
  };
}

export async function buildHomeSummary(userId: string): Promise<HomeSummary | null> {
  const account = await buildAccount(userId);
  if (!account) return null;
  const owned = { project: { userId } };
  const [clipTotal, top, active, rendering] = await Promise.all([
    prisma.clip.count({ where: owned }),
    prisma.clip.findMany({
      where: { ...owned, status: "ready", score: { not: null } },
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: 4,
      select: { id: true, score: true, durationSec: true, thumbnailUrl: true },
    }),
    // The dashboard's "active" (started, resumable) definition.
    prisma.project.count({ where: startedResumableWhere(userId) }),
    prisma.project.findMany({ where: { userId, status: { in: ["queued", "analyzing", "rendering"] } }, select: { progress: true } }),
  ]);
  const thumbs = await Promise.all(
    top.map(async (c) => ({
      id: c.id,
      score: Math.max(0, Math.min(100, c.score ?? 0)),
      durationSec: Math.round(c.durationSec),
      thumbnailUrl: (await resignMediaUrl(c.thumbnailUrl)) ?? "",
    })),
  );
  return {
    user: { name: account.user.name, avatarUrl: account.user.avatarUrl },
    clipMinutes: { remaining: account.clipMinutes.remaining, total: Math.max(account.clipMinutes.allowance, account.clipMinutes.remaining) },
    aiCredits: { remaining: account.aiCredits.remaining },
    clips: { total: clipTotal, top: thumbs.filter((t) => t.thumbnailUrl) },
    projects: {
      active,
      rendering: rendering.length,
      renderProgress: rendering.length ? Math.round(rendering.reduce((s, p) => s + p.progress, 0) / rendering.length) : null,
    },
    creator: account.creator,
    unreadNotifications: account.unreadNotifications,
    referralPercent: account.referralPercent,
  };
}

// ── Activity ───────────────────────────────────────────────────────────────

const TOOL_NAMES: Record<string, string> = Object.fromEntries(TOOL_CATALOG.map((t) => [t.id, t.name.replace(/^AI /, "")]));
TOOL_NAMES["auto-clip"] = "AutoClip";
TOOL_NAMES["editor-captions"] = "Editor captions";
TOOL_NAMES["editor-render"] = "Editor export";
TOOL_NAMES["auto-clip-dub"] = "Clip dubbing";
TOOL_NAMES["auto-clip-rerender"] = "AutoClip re-render";
// Retired (captions are rendered in-house now); kept so old ledger rows still read well.
TOOL_NAMES["caption-render"] = "Premium captions";

function toolName(slug: string) {
  return TOOL_NAMES[slug] ?? slug.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** A ledger reason ("spend:voiceover", "grant:pack", "refund:auto-clip-dub-failed") in plain words. */
export function describeReason(reason: string, projectTitle?: string | null): { label: string; kind: Activity["kind"] } {
  const colon = reason.indexOf(":");
  const verb = colon < 0 ? reason : reason.slice(0, colon);
  const rest = colon < 0 ? "" : reason.slice(colon + 1);
  if (verb === "spend") {
    const kind: Activity["kind"] = rest === "auto-clip" ? "autoclip" : rest === "image-generator" ? "image" : rest === "voiceover" ? "voiceover" : "other";
    return { label: projectTitle ? `${toolName(rest)} · ${projectTitle}` : toolName(rest), kind };
  }
  if (verb === "refund") {
    const tool = rest.replace(/-(failed|stranded|cancelled|partial)$/, "");
    return { label: `Refund · ${toolName(tool)}`, kind: "refund" };
  }
  if (verb === "grant") {
    if (rest.startsWith("referral") || rest.startsWith("affiliate")) return { label: "Referral reward", kind: "referral" };
    if (rest === "pack" || rest === "minute-pack" || rest.startsWith("purchase")) return { label: rest === "minute-pack" ? "Minute pack" : "Credit pack", kind: "purchase" };
    if (rest.startsWith("quest-rank-")) return { label: `Level reward · ${rest.slice("quest-rank-".length)}`, kind: "other" };
    if (rest === "signup") return { label: "Welcome bonus", kind: "other" };
    if (rest === "trial") return { label: "Trial", kind: "other" };
    if (rest.startsWith("admin")) return { label: "Added by Clipiro support", kind: "other" };
    return { label: "Monthly refill", kind: "other" };
  }
  if (verb === "expire" || verb === "lapse") return { label: "Expired", kind: "other" };
  return { label: toolName(reason), kind: "other" };
}

const ACTIVITY_PAGE = 30;

/** Credit and Clip Minute ledgers merged, newest first. `cursor` = the last item's time. */
export async function buildActivity(userId: string, cursor: string | null): Promise<ActivityPage> {
  const before = cursor ? new Date(cursor) : undefined;
  const where = { userId, ...(before && !Number.isNaN(before.getTime()) ? { createdAt: { lt: before } } : {}) };
  const select = { id: true, delta: true, reason: true, refId: true, createdAt: true } as const;
  const [credits, minutes] = await Promise.all([
    prisma.creditTransaction.findMany({ where, orderBy: { createdAt: "desc" }, take: ACTIVITY_PAGE + 1, select }),
    prisma.minuteTransaction.findMany({ where, orderBy: { createdAt: "desc" }, take: ACTIVITY_PAGE + 1, select }),
  ]);
  const rows = [...credits.map((r) => ({ ...r, unit: "credits" as const })), ...minutes.map((r) => ({ ...r, unit: "minutes" as const }))]
    .filter((r) => r.delta !== 0)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const page = rows.slice(0, ACTIVITY_PAGE);

  // AutoClip spends point at their project; name it ("AutoClip · Ep. 42").
  const projectIds = [...new Set(page.filter((r) => r.reason === "spend:auto-clip" && r.refId).map((r) => r.refId!))];
  const projects = projectIds.length
    ? await prisma.project.findMany({ where: { id: { in: projectIds }, userId }, select: { id: true, title: true } })
    : [];
  const titles = new Map(projects.map((p) => [p.id, p.title]));

  return {
    items: page.map((r) => {
      const { label, kind } = describeReason(r.reason, r.refId ? titles.get(r.refId) : null);
      return { id: `${r.unit === "credits" ? "c" : "m"}_${r.id}`, label, kind, delta: r.delta, unit: r.unit, at: r.createdAt.toISOString() };
    }),
    nextCursor: rows.length > ACTIVITY_PAGE ? page[page.length - 1]!.createdAt.toISOString() : null,
  };
}

// ── Plans and tools ────────────────────────────────────────────────────────

export async function buildPlans(): Promise<PlansResponse> {
  const rows = await getPublicPlans();
  const price = (slug: string) => {
    const r = rows.find((p) => p.slug === slug);
    return r ? { usdCents: r.usdPriceInCents, inrPaise: r.priceInPaise } : null;
  };
  const free = { usdCents: 0, inrPaise: 0 };
  const sub = (tier: string, months: number) => rows.find((p) => p.kind === "subscription" && p.tier === tier && p.intervalMonths === months);

  const plans = PLANS.flatMap((p) => {
    if (p.tier === "free") {
      return [{ ...staticPlan(p), monthly: free, yearly: free, minutes: FREE_TIER_MONTHLY_BONUS_MINUTES, credits: FREE_TIER_MONTHLY_BONUS_CREDITS }];
    }
    const m = sub(p.tier, 1);
    const y = sub(p.tier, 12);
    if (!m || !y) return []; // a tier switched off on the web isn't offered
    return [
      {
        ...staticPlan(p),
        monthly: { usdCents: m.usdPriceInCents, inrPaise: m.priceInPaise },
        yearly: { usdCents: y.usdPriceInCents, inrPaise: y.priceInPaise },
        minutes: m.monthlyMinutes ?? p.minutes,
        credits: m.monthlyCredits ?? p.credits,
      },
    ];
  });

  return {
    plans,
    creditPacks: CREDIT_PACKS.flatMap((p) => {
      const pr = price(p.id);
      const row = rows.find((r) => r.slug === p.id);
      return pr && row ? [{ id: p.id, name: p.name, credits: row.credits, price: pr, bestValue: "bestValue" in p && !!p.bestValue }] : [];
    }),
    minutePacks: MINUTE_PACKS.flatMap((p) => {
      const pr = price(p.id);
      const row = rows.find((r) => r.slug === p.id);
      return pr && row ? [{ id: p.id, minutes: row.minutes ?? p.minutes, price: pr }] : [];
    }),
    yearlyDiscountPct: YEARLY_DISCOUNT_PCT,
  };
}

function staticPlan(p: (typeof PLANS)[number]) {
  return {
    tier: p.tier,
    name: p.name,
    tagline: p.tagline,
    storageGb: STORAGE_LIMIT_GB[p.tier],
    uploadHours: TIER_MAX_AUTOCLIP_SOURCE_SECONDS[p.tier] / 3600,
    perks: [...p.perks],
  };
}

/**
 * Web-only tools the app never lists, not even as "coming soon": Google Play
 * removes apps that download from YouTube (decision 2026-10-10), and the
 * Instagram one goes with it. Their names stay in TOOL_NAMES for usage history.
 */
const NOT_IN_APP = new Set(["youtube-downloader", "instagram-downloader"]);

export async function buildTools(): Promise<Tool[]> {
  const config = await getAllToolConfigs();
  return TOOL_CATALOG.flatMap<Tool>(({ per, from, ...t }) => {
    if (NOT_IN_APP.has(t.id)) return [];
    if (t.id === "autoclip") return [{ ...t, cost: { kind: "clipMinutes" as const }, requiredTier: null }];
    const live = config[t.id];
    if (live && !live.enabled) return [];
    const amount = t.id === "image-generator" ? cheapestImageCost : (live?.creditCost ?? TOOL_COSTS[t.id]?.creditCost ?? 0);
    const tier = TOOL_COSTS[t.id]?.requiredTier;
    return [
      {
        ...t,
        cost: amount > 0 ? { kind: "credits" as const, amount, per: per ?? null, from: !!from } : { kind: "free" as const },
        requiredTier: tier === "pro" ? ("pro" as const) : null,
      },
    ];
  });
}

// ── Settings ───────────────────────────────────────────────────────────────

export async function buildSettings(userId: string): Promise<AccountSettings | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferredLanguage: true, notificationPreference: { select: { weeklySummary: true, productUpdates: true } } },
  });
  if (!user) return null;
  const language = LANGUAGES.find((l) => l.code === user.preferredLanguage)?.code ?? "en";
  return {
    language,
    // No row yet = the schema's defaults (both on).
    email: { weeklySummary: user.notificationPreference?.weeklySummary ?? true, productUpdates: user.notificationPreference?.productUpdates ?? true },
  };
}
