// Query-string parsing shared by the v2 sub-routes.
//
// Next 16 hands `searchParams` to a page as a Promise, and every value can be a
// string, an array, or missing. Doing that parsing once keeps five page
// components from each getting it subtly wrong.

import { redirect } from "next/navigation";
import { getServerSubscriberState, type TokenPayload } from "@/lib/auth";
import { withNextParam } from "@/lib/safe-redirect";
import { loadAccounts, type AccountContext } from "@/lib/social/queries";

export type SearchParams = Record<string, string | string[] | undefined>;

/** Where a visitor is returned to once they have signed back in. */
const TRACKER_PATH = "/dashboard/social-tracker";

/**
 * The Social Tracker's access gate, shared by the layout and every sub-route
 * so the two can't drift.
 *
 * The two denials are routed differently on purpose. A lapsed subscription
 * belongs on the billing overlay — and that is `/dashboard?billing=1`, not
 * `/dashboard/billing`, which has no page and no redirect rule and so 404s.
 * A session that no longer resolves belongs at the login form instead: telling
 * someone whose session was revoked (or who is here during a Redis outage,
 * which reads the same way — see getServerSubscriberState) that they have no
 * subscription is both wrong and unactionable.
 *
 * The login case cannot redirect to /login directly. The cookie's JWT is still
 * signed and unexpired — that is how the request got past proxy.ts at all — so
 * proxy would bounce /login straight back to /dashboard, dead session and all.
 * /api/auth/session-expired clears the cookie first, which is what makes the
 * login form reachable.
 *
 * Neither target is under /dashboard/social-tracker, so a redirect can't loop.
 */
export async function requireSubscriberOrRedirect(): Promise<TokenPayload> {
  const state = await getServerSubscriberState();
  if (state.status === "active") return state.auth;
  if (state.status === "unauthenticated") {
    redirect(withNextParam("/api/auth/session-expired", TRACKER_PATH));
  }
  redirect("/dashboard?billing=1");
}

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const VALID_RANGES = [7, 30, 90, 365];

/** The one account in view, every account at once, or "not chosen yet". */
export type AccountScope = { kind: "one"; id: string } | { kind: "all" } | { kind: "unset" };

export interface ViewFilters {
  range: number;
  granularity: "day" | "week" | "month";
  compare: boolean;
  accountIds?: string[];
  sort?: string;
  /**
   * Which account the whole surface is scoped to, from `?account=`.
   *
   * The tracker is account-first: you land on a picker, choose one, and every
   * tab stays on it. `?account=all` is the deliberate opt-in to the
   * cross-account comparison, and no `?account=` at all means "show me the
   * picker" — which is why "unset" is a distinct state and not just a default
   * of "all".
   */
  scope: AccountScope;
}

export function parseFilters(params: SearchParams): ViewFilters {
  const rangeRaw = Number(first(params.range) ?? 30);
  const granularityRaw = first(params.granularity);
  const account = first(params.account);
  // The legacy `?accounts=a,b` still narrows the load; `?account=` is what
  // drives the account-first flow.
  const legacyIds = first(params.accounts)?.split(",").filter(Boolean);

  const scope: AccountScope =
    account === "all" ? { kind: "all" } : account ? { kind: "one", id: account } : { kind: "unset" };

  return {
    // Fall back rather than 400: a hand-edited URL should degrade to the
    // default view, not to an error page.
    range: VALID_RANGES.includes(rangeRaw) ? rangeRaw : 30,
    granularity:
      granularityRaw === "week" || granularityRaw === "month" ? granularityRaw : "day",
    compare: first(params.compare) === "previous",
    accountIds: scope.kind === "one" ? [scope.id] : legacyIds,
    sort: first(params.sort),
    scope,
  };
}

export interface ViewContext {
  userId: string;
  /** The accounts this view renders — one when scoped, otherwise all of them. */
  accounts: AccountContext[];
  /** Every connected account, for the picker and the switcher. */
  allAccounts: AccountContext[];
  filters: ViewFilters;
}

/**
 * Auth + account load for a sub-route.
 *
 * Redirects rather than throwing when the session is gone, so an expired tab
 * lands somewhere useful instead of on an error boundary.
 *
 * Scoping to one account narrows `accounts` to a single element, which is why
 * the five sub-pages needed no changes: they already loop over this array, so a
 * one-element array renders exactly one account's analytics.
 */
export async function loadViewContext(params: SearchParams): Promise<ViewContext> {
  // The layout already gated this; this is the belt to its braces.
  const auth = await requireSubscriberOrRedirect();

  const filters = parseFilters(params);
  // One query, then filter in memory: nobody connects enough accounts for this
  // to matter, and every account here is already ownership-scoped by userId, so
  // an `?account=` pointing at someone else's id simply matches nothing.
  const allAccounts = await loadAccounts(auth.userId);
  const requested = filters.accountIds;
  const scoped = requested?.length
    ? allAccounts.filter((a) => requested.includes(a.id))
    : allAccounts;

  // An id that matches nothing — stale bookmark, disconnected account, someone
  // else's — falls back to the picker instead of rendering a convincing empty
  // dashboard that looks like the account has no data.
  const accounts = scoped.length > 0 ? scoped : allAccounts;
  const resolvedScope: AccountScope =
    filters.scope.kind === "one" && scoped.length === 0 ? { kind: "unset" } : filters.scope;

  return {
    userId: auth.userId,
    accounts,
    allAccounts,
    filters: { ...filters, scope: resolvedScope },
  };
}

export function accountLabel(a: AccountContext): string {
  return a.displayName ?? a.username ?? a.provider;
}
