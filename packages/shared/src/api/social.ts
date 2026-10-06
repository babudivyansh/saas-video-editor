import { z } from "zod";
import {
  addCompetitorRequest,
  analyticsOverviewSchema,
  audienceSchema,
  competitorsResponse,
  contentPerformanceSchema,
  insightsOverviewSchema,
  platformAnalyticsSchema,
  socialAccountsResponse,
  summaryRequest,
  summaryResponse,
  type RangeDays,
} from "../schemas/insights";
import type { ApiClient } from "./client";

const enc = encodeURIComponent;
/** The phone's time zone, so days and best times match the user's clock. */
const localTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};
const q = (range: RangeDays, extra: Record<string, string | null | undefined> = {}) => {
  const p = new URLSearchParams({ range: String(range), tz: localTz() });
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  return `?${p}`;
};

// /api/mobile/v1/social. Subscriber-only: a 402 ApiError with code
// "subscription_required" means show the upgrade prompt.
export function socialApi(api: ApiClient) {
  return {
    accounts: () => api.request("/social/accounts", { schema: socialAccountsResponse }),
    syncAccount: (id: string) => api.request(`/social/accounts/${enc(id)}/sync`, { method: "POST", body: {}, schema: z.object({ ok: z.literal(true) }) }),
    overview: (range: RangeDays) => api.request(`/social/overview${q(range)}`, { schema: insightsOverviewSchema }),
    content: (range: RangeDays, accountId?: string | null) => api.request(`/social/content${q(range, { accountId })}`, { schema: contentPerformanceSchema }),
    platform: (accountId: string, range: RangeDays) => api.request(`/social/accounts/${enc(accountId)}/platform${q(range)}`, { schema: platformAnalyticsSchema }),
    audience: (accountId: string) => api.request(`/social/accounts/${enc(accountId)}/audience${q(30)}`, { schema: audienceSchema }),
    analytics: (range: RangeDays) => api.request(`/social/analytics${q(range)}`, { schema: analyticsOverviewSchema }),
    competitors: () => api.request("/social/competitors", { schema: competitorsResponse }),
    addCompetitor: (b: z.input<typeof addCompetitorRequest>) => api.request("/social/competitors", { method: "POST", body: addCompetitorRequest.parse(b), schema: competitorsResponse }),
    removeCompetitor: (id: string) => api.request(`/social/competitors/${enc(id)}`, { method: "DELETE", schema: competitorsResponse }),
    summary: (accountId: string, period: "weekly" | "monthly" = "weekly") =>
      api.request(`/social/summary?accountId=${enc(accountId)}&period=${period}`, { schema: summaryResponse }),
    /** Makes a new summary (charged, unless a recent one exists). */
    makeSummary: (b: z.input<typeof summaryRequest>) => api.request("/social/summary", { method: "POST", body: summaryRequest.parse(b), schema: summaryResponse }),
  };
}
