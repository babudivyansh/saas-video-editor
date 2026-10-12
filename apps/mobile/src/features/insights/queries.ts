import type { Provider, RangeDays } from "@clipiro/shared";
import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import { getContentPerformance, getInsightsOverview, getPlatformAnalytics, getSocialAccounts } from "@mocks/insights";

// Insights' data. Phase 5 swaps the mock fetchers for the API client.
export const insightKeys = {
  accounts: ["social", "accounts"] as const,
  overview: (r: RangeDays) => ["insights", "overview", r] as const,
  content: (r: RangeDays) => ["insights", "content", r] as const,
  platform: (p: Provider, r: RangeDays) => ["insights", "platform", p, r] as const,
};

/** The chosen period, shared by every Insights tab. */
export const useRange = create<{ range: RangeDays; setRange: (r: RangeDays) => void }>((set) => ({ range: 30, setRange: (range) => set({ range }) }));

export const useSocialAccounts = () => useQuery({ queryKey: insightKeys.accounts, queryFn: getSocialAccounts });
export const useOverview = (r: RangeDays, enabled: boolean) => useQuery({ queryKey: insightKeys.overview(r), queryFn: () => getInsightsOverview(r), enabled });
export const useContent = (r: RangeDays, enabled: boolean) => useQuery({ queryKey: insightKeys.content(r), queryFn: () => getContentPerformance(r), enabled });
export const usePlatform = (p: Provider, r: RangeDays, enabled: boolean) => useQuery({ queryKey: insightKeys.platform(p, r), queryFn: () => getPlatformAnalytics(p, r), enabled });
