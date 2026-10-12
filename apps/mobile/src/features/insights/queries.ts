import { ApiError, type RangeDays } from "@clipiro/shared";
import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import { social } from "@/lib/api";

// Insights' data from /api/mobile/v1/social — the web's Social Tracker
// services (Phase 5.6). Subscriber-only: a 402 with code
// "subscription_required" shows the upgrade prompt (isUpsell).
export const insightKeys = {
  accounts: ["social", "accounts"] as const,
  overview: (r: RangeDays) => ["insights", "overview", r] as const,
  content: (r: RangeDays) => ["insights", "content", r] as const,
  platform: (accountId: string, r: RangeDays) => ["insights", "platform", accountId, r] as const,
};

/** The chosen period, shared by every Insights tab. */
export const useRange = create<{ range: RangeDays; setRange: (r: RangeDays) => void }>((set) => ({ range: 30, setRange: (range) => set({ range }) }));

/** True for the paid-plan refusal (Social Tracker is on paid plans, as on the web). */
export const isUpsell = (e: unknown) => e instanceof ApiError && e.status === 402 && e.code === "subscription_required";

const accountsQuery = { queryKey: insightKeys.accounts, queryFn: social.accounts, retry: (n: number, e: unknown) => !isUpsell(e) && n < 2 };
export const useSocialAccounts = () => useQuery({ ...accountsQuery, select: (r) => r.accounts });
/** The platforms this server can connect right now (the same request as the accounts). */
export const useConnectable = () => useQuery({ ...accountsQuery, select: (r) => r.connectable });
export const useOverview = (r: RangeDays, enabled: boolean) => useQuery({ queryKey: insightKeys.overview(r), queryFn: () => social.overview(r), enabled });
export const useContent = (r: RangeDays, enabled: boolean) => useQuery({ queryKey: insightKeys.content(r), queryFn: () => social.content(r), enabled });
export const usePlatform = (accountId: string | null, r: RangeDays) =>
  useQuery({ queryKey: insightKeys.platform(accountId ?? "", r), queryFn: () => social.platform(accountId!, r), enabled: !!accountId });
