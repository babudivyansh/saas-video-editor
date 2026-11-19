// The Admin → Users list's filters, shared by the list (GET /api/admin/users)
// and its CSV export (GET /api/admin/users/export) so the file always matches
// what is on screen.

import type { Prisma } from "@prisma/client";
import { AUTOCLIP } from "@/lib/admin/staff-digest";

const DAY = 86_400_000;

// ?filter= narrows the list to accounts that need a particular kind of support.
const SUPPORT_FILTERS: Record<string, Prisma.UserWhereInput> = {
  suspended: { suspendedAt: { not: null } },
  deactivated: { deactivatedAt: { not: null } },
  unverified: { emailVerifiedAt: null },
  "2fa": { twoFactorEnabled: true },
  admins: { role: "ADMIN" },
  // "subscribed" is built per request below (it compares against now).
};

const NEVER_RAN: Prisma.UserWhereInput = { projects: { none: { productType: AUTOCLIP } } };

/** ?journey= — how far through the funnel the account got. */
export const JOURNEY_FILTERS = ["never_ran", "stuck", "ran", "paid", "free_after_run"] as const;
/** ?joined= — signed up within the last N days. */
export const JOINED_FILTERS = { "1d": 1, "7d": 7, "30d": 30, "90d": 90 } as const;
/** ?active= — last login. */
export const ACTIVE_FILTERS = ["7d", "inactive_30d"] as const;

export function buildUserWhere(params: URLSearchParams, now: Date = new Date()): Prisma.UserWhereInput {
  const search = params.get("search")?.trim() ?? "";
  const filter = params.get("filter") ?? "";
  const journey = params.get("journey") ?? "";
  const joined = params.get("joined") ?? "";
  const method = params.get("method") ?? "";
  const use = params.get("use") ?? "";
  const active = params.get("active") ?? "";

  const and: Prisma.UserWhereInput[] = [];
  if (search) {
    and.push({ OR: [{ email: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }] });
  }
  if (filter === "subscribed") and.push({ subscriptionEndsAt: { gt: now }, planId: { not: null } });
  else if (SUPPORT_FILTERS[filter]) and.push(SUPPORT_FILTERS[filter]);

  switch (journey) {
    case "never_ran":
      and.push(NEVER_RAN);
      break;
    case "stuck": // signed up over a day ago and still never started a run
      and.push(NEVER_RAN, { createdAt: { lt: new Date(now.getTime() - DAY) } });
      break;
    case "ran":
      and.push({ projects: { some: { productType: AUTOCLIP } } });
      break;
    case "paid":
      and.push({ purchases: { some: { amountInPaise: { gt: 0 } } } });
      break;
    case "free_after_run": // used AutoClip, never paid: the upgrade audience
      and.push({ projects: { some: { productType: AUTOCLIP } } }, { purchases: { none: { amountInPaise: { gt: 0 } } } });
      break;
  }

  const days = JOINED_FILTERS[joined as keyof typeof JOINED_FILTERS];
  if (days) and.push({ createdAt: { gte: new Date(now.getTime() - days * DAY) } });

  // Google signups get a random password hash, so hasPassword=false marks them.
  if (method === "google") and.push({ hasPassword: false });
  else if (method === "email") and.push({ hasPassword: true });

  if (/^[a-z_]{1,40}$/.test(use)) and.push({ intendedUse: use });

  if (active === "7d") and.push({ lastLoginAt: { gte: new Date(now.getTime() - 7 * DAY) } });
  else if (active === "inactive_30d") {
    and.push({ OR: [{ lastLoginAt: null }, { lastLoginAt: { lt: new Date(now.getTime() - 30 * DAY) } }] });
  }

  return and.length ? { AND: and } : {};
}
