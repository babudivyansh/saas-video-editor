import { z } from "zod";
import {
  addCompetitorRequest,
  analyticsOverviewSchema,
  audienceSchema,
  competitorsResponse,
  connectUrlResponse,
  contentPerformanceSchema,
  csvExportResponse,
  reportCreatedResponse,
  reportDownloadResponse,
  reportRequest,
  reportsResponse,
  shareLinkCreatedResponse,
  shareLinkRequest,
  insightsOverviewSchema,
  platformAnalyticsSchema,
  socialAccountsResponse,
  summaryRequest,
  summaryResponse,
  type RangeDays,
} from "../schemas/insights";
import {
  captionIdeasRequest,
  captionIdeasResponse,
  createPostsRequest,
  createPostsResponse,
  linkPostRequest,
  postResponse,
  postsResponse,
  updatePostRequest,
  type PostStatus,
} from "../schemas/social";
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
    /** The sign-in page for connecting (or reconnecting) a platform. */
    connectUrl: (provider: string) => api.request(`/social/connect/${enc(provider)}`, { schema: connectUrlResponse }),
    disconnect: (id: string) => api.request(`/social/accounts/${enc(id)}`, { method: "DELETE", schema: z.object({ ok: z.literal(true) }) }),
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
    reports: () => api.request("/social/reports", { schema: reportsResponse }),
    /** Generates a report now (and, with a schedule, again every week or month by email). */
    createReport: (b: z.input<typeof reportRequest>) => api.request("/social/reports", { method: "POST", body: reportRequest.parse(b), schema: reportCreatedResponse }),
    reportDownload: (id: string) => api.request(`/social/reports/${enc(id)}/download`, { schema: reportDownloadResponse }),
    createShareLink: (b: z.input<typeof shareLinkRequest>) => api.request("/social/share-links", { method: "POST", body: shareLinkRequest.parse(b), schema: shareLinkCreatedResponse }),
    revokeShareLink: (id: string) => api.request(`/social/share-links/${enc(id)}`, { method: "DELETE", schema: z.object({ ok: z.literal(true) }) }),
    exportCsv: (accountId: string) => api.request(`/social/export?accountId=${enc(accountId)}`, { schema: csvExportResponse }),
    /** Posts with their time in [from, to] (ISO), earliest first; one status optional. */
    posts: (p: { from?: string; to?: string; status?: PostStatus; cursor?: string | null } = {}) => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(p)) if (v) qs.set(k, v);
      const s = qs.toString();
      return api.request(`/social/posts${s ? `?${s}` : ""}`, { schema: postsResponse });
    },
    post: (id: string) => api.request(`/social/posts/${enc(id)}`, { schema: postResponse }),
    /** One post per account; "now" starts posting straight away. */
    createPosts: (b: z.input<typeof createPostsRequest>) => api.request("/social/posts", { method: "POST", body: createPostsRequest.parse(b), schema: createPostsResponse }),
    updatePost: (id: string, b: z.input<typeof updatePostRequest>) => api.request(`/social/posts/${enc(id)}`, { method: "PATCH", body: updatePostRequest.parse(b), schema: postResponse }),
    /** Cancels a scheduled post, or removes a finished one from Clipiro. */
    deletePost: (id: string) => api.request(`/social/posts/${enc(id)}`, { method: "DELETE", schema: z.object({ ok: z.literal(true) }) }),
    retryPost: (id: string) => api.request(`/social/posts/${enc(id)}/retry`, { method: "POST", body: {}, schema: postResponse }),
    /** "I posted it": the live post's link. */
    linkPost: (id: string, permalink: string) => api.request(`/social/posts/${enc(id)}/link`, { method: "POST", body: linkPostRequest.parse({ permalink }), schema: postResponse }),
    /** AI caption ideas for an account (charged). */
    captionIdeas: (b: z.input<typeof captionIdeasRequest>) => api.request(`/social/captions?tz=${enc(localTz())}`, { method: "POST", body: captionIdeasRequest.parse(b), schema: captionIdeasResponse }),
    /** Makes a new summary (charged, unless a recent one exists). */
    makeSummary: (b: z.input<typeof summaryRequest>) => api.request("/social/summary", { method: "POST", body: summaryRequest.parse(b), schema: summaryResponse }),
  };
}
