// Query-string parsing shared by the v2 sub-routes.
//
// Next 16 hands `searchParams` to a page as a Promise, and every value can be a
// string, an array, or missing. Doing that parsing once keeps five page
// components from each getting it subtly wrong.

import { redirect } from "next/navigation";
import { requireServerSubscriber } from "@/lib/auth";
import { loadAccounts, type AccountContext } from "@/lib/social/queries";

export type SearchParams = Record<string, string | string[] | undefined>;

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const VALID_RANGES = [7, 30, 90, 365];

export interface ViewFilters {
  range: number;
  granularity: "day" | "week" | "month";
  compare: boolean;
  accountIds?: string[];
  sort?: string;
}

export function parseFilters(params: SearchParams): ViewFilters {
  const rangeRaw = Number(first(params.range) ?? 30);
  const granularityRaw = first(params.granularity);
  return {
    // Fall back rather than 400: a hand-edited URL should degrade to the
    // default view, not to an error page.
    range: VALID_RANGES.includes(rangeRaw) ? rangeRaw : 30,
    granularity:
      granularityRaw === "week" || granularityRaw === "month" ? granularityRaw : "day",
    compare: first(params.compare) === "previous",
    accountIds: first(params.accounts)?.split(",").filter(Boolean),
    sort: first(params.sort),
  };
}

export interface ViewContext {
  userId: string;
  accounts: AccountContext[];
  filters: ViewFilters;
}

/**
 * Auth + account load for a sub-route.
 *
 * Redirects rather than throwing when the session is gone, so an expired tab
 * lands somewhere useful instead of on an error boundary.
 */
export async function loadViewContext(params: SearchParams): Promise<ViewContext> {
  const auth = await requireServerSubscriber();
  // The layout already gated this; the redirect is the belt to its braces, and
  // it must not point at this same route or an expired session loops forever.
  if (!auth) redirect("/dashboard/billing");

  const filters = parseFilters(params);
  const accounts = await loadAccounts(auth.userId, filters.accountIds);
  return { userId: auth.userId, accounts, filters };
}

export function accountLabel(a: AccountContext): string {
  return a.displayName ?? a.username ?? a.provider;
}
