import { prisma } from "@/lib/prisma";
import { CRON_CATALOG, CRON_SCHEDULE, runIdForPath } from "@/lib/cron-catalog";
import type { AuditTargetType } from "@/lib/admin/audit-catalog";

// Turns audit target ids into something a person can check: the account's
// email, the coupon's code, the plan's name — and a link to it in the admin.
// One batched query per target type for a whole page of rows. A target that
// no longer exists (deleted) falls back to whatever the row's own `before`
// snapshot says it was, marked as deleted.

export interface ResolvedTarget {
  label: string;
  href: string | null;
  deleted: boolean;
}

export interface TargetRef {
  targetId: string | null;
  targetType: AuditTargetType;
  /** The row's before-snapshot, for naming targets that have since been deleted. */
  before: string | null;
}

const key = (type: AuditTargetType, id: string) => `${type}:${id}`;

function snapshotName(before: string | null): string | null {
  if (!before) return null;
  try {
    const b = JSON.parse(before) as Record<string, unknown>;
    for (const k of ["email", "code", "name", "title", "slug"]) if (typeof b[k] === "string") return b[k] as string;
  } catch { /* not JSON */ }
  return null;
}

const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

export async function resolveTargets(refs: TargetRef[]): Promise<Map<string, ResolvedTarget>> {
  const out = new Map<string, ResolvedTarget>();
  const ids = (type: AuditTargetType) => [...new Set(refs.filter((r) => r.targetType === type && r.targetId).map((r) => r.targetId!))];

  const [users, coupons, plans, reviews, affiliates, announcements, projects, assets, purchases, commissions, socials] = await Promise.all([
    ids("user").length ? prisma.user.findMany({ where: { id: { in: ids("user") } }, select: { id: true, email: true } }) : [],
    ids("coupon").length ? prisma.coupon.findMany({ where: { id: { in: ids("coupon") } }, select: { id: true, code: true } }) : [],
    ids("plan").length ? prisma.plan.findMany({ where: { id: { in: ids("plan") } }, select: { id: true, name: true } }) : [],
    ids("review").length ? prisma.review.findMany({ where: { id: { in: ids("review") } }, select: { id: true, title: true, rating: true, user: { select: { email: true } } } }) : [],
    ids("affiliate").length ? prisma.affiliate.findMany({ where: { id: { in: ids("affiliate") } }, select: { id: true, code: true } }) : [],
    ids("announcement").length ? prisma.featureAnnouncement.findMany({ where: { id: { in: ids("announcement") } }, select: { id: true, title: true } }) : [],
    ids("project").length ? prisma.project.findMany({ where: { id: { in: ids("project") } }, select: { id: true, title: true, userId: true } }) : [],
    ids("asset").length ? prisma.asset.findMany({ where: { id: { in: ids("asset") } }, select: { id: true, name: true, userId: true } }) : [],
    ids("purchase").length ? prisma.purchase.findMany({ where: { id: { in: ids("purchase") } }, select: { id: true, amountInPaise: true, userId: true, plan: { select: { name: true } } } }) : [],
    ids("commission").length ? prisma.commission.findMany({ where: { id: { in: ids("commission") } }, select: { id: true, amount: true, affiliate: { select: { code: true } } } }) : [],
    ids("social_account").length ? prisma.socialAccount.findMany({ where: { id: { in: ids("social_account") } }, select: { id: true, provider: true, username: true, displayName: true } }) : [],
  ]);

  const set = (type: AuditTargetType, id: string, label: string, href: string | null) => out.set(key(type, id), { label, href, deleted: false });
  for (const u of users) set("user", u.id, u.email, `/admin/users/${u.id}`);
  for (const c of coupons) set("coupon", c.id, c.code, "/admin/coupons");
  for (const p of plans) set("plan", p.id, p.name, "/admin/pricing");
  for (const r of reviews) set("review", r.id, `${"★".repeat(r.rating)} ${r.title ?? "review"} — ${r.user.email}`, `/admin/reviews/${r.id}`);
  for (const a of affiliates) set("affiliate", a.id, a.code, "/admin/affiliate");
  for (const a of announcements) set("announcement", a.id, a.title, "/admin/announcements");
  for (const p of projects) set("project", p.id, p.title || "(untitled project)", `/admin/users/${p.userId}`);
  for (const a of assets) set("asset", a.id, a.name, `/admin/users/${a.userId}`);
  for (const p of purchases) set("purchase", p.id, `${inr(p.amountInPaise)}${p.plan ? ` · ${p.plan.name}` : ""}`, `/admin/users/${p.userId}`);
  for (const c of commissions) set("commission", c.id, `₹${c.amount.toFixed(0)} · ${c.affiliate.code}`, "/admin/affiliate");
  for (const s of socials) set("social_account", s.id, `${s.provider} · ${s.displayName ?? s.username ?? s.id}`, null);

  // Ids that aren't database rows: shown as themselves, linked to their tab.
  const cronLabel = new Map(CRON_SCHEDULE.map((e) => [runIdForPath(e.path) as string, CRON_CATALOG[e.path]?.label ?? e.path]));
  for (const r of refs) {
    if (!r.targetId) continue;
    const k = key(r.targetType, r.targetId);
    if (out.has(k)) continue;
    switch (r.targetType) {
      case "cron": out.set(k, { label: cronLabel.get(r.targetId) ?? r.targetId, href: "/admin/ops?tab=jobs", deleted: false }); break;
      case "queue_job": out.set(k, { label: r.targetId, href: "/admin/ops?tab=queues", deleted: false }); break;
      case "flag": out.set(k, { label: r.targetId, href: "/admin/ops?tab=flags", deleted: false }); break;
      case "tool": out.set(k, { label: r.targetId, href: "/admin/tools", deleted: false }); break;
      case "model": out.set(k, { label: r.targetId, href: "/admin/models", deleted: false }); break;
      case "none": out.set(k, { label: r.targetId, href: null, deleted: false }); break;
      default: {
        // A database entity that's gone — name it from the row's own snapshot.
        const name = snapshotName(r.before);
        out.set(k, { label: name ?? r.targetId, href: null, deleted: true });
      }
    }
  }
  return out;
}

export function targetKey(type: AuditTargetType, id: string): string {
  return key(type, id);
}
