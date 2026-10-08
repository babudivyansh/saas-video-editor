import type { GeneratedMedia, PlanTier } from "@clipiro/shared";
import { useQuery } from "@tanstack/react-query";
import { assets, me } from "@/lib/api";
import { getCaptionTemplates, getCreateContext, getImageModels, getRecentResults, getVoices } from "@mocks/create";

// The Create tab's data. Phase 5 swaps the mock fetchers for the API client.
export const createKeys = {
  context: ["create", "context"] as const,
  captions: ["caption-templates"] as const,
  imageModels: ["image-models"] as const,
  voices: ["voices"] as const,
  results: (kind: GeneratedMedia["kind"]) => ["ai-results", kind] as const,
};

const HOUR = 60 * 60 * 1000;
export const useCreateContext = () => useQuery({ queryKey: createKeys.context, queryFn: getCreateContext });
export const useCaptionTemplates = () => useQuery({ queryKey: createKeys.captions, queryFn: getCaptionTemplates, staleTime: HOUR });
export const useImageModels = () => useQuery({ queryKey: createKeys.imageModels, queryFn: getImageModels, staleTime: HOUR });
export const useVoices = () => useQuery({ queryKey: createKeys.voices, queryFn: getVoices, staleTime: HOUR });
export const useRecentResults = (kind: GeneratedMedia["kind"]) => useQuery({ queryKey: createKeys.results(kind), queryFn: () => getRecentResults(kind) });

/** What the AutoClip screen needs: plan (for limits), balances, and the videos already in Assets. */
export type CreateContext = {
  plan: PlanTier;
  clipMinutes: number;
  aiCredits: number;
  videoAssets: { id: string; title: string; durationSec: number; thumbnailUrl: string | null }[];
};

async function getAutoClipContext(): Promise<CreateContext> {
  const [account, videos] = await Promise.all([me.account(), assets.list({ kind: "video" })]);
  return {
    plan: account.plan.tier,
    clipMinutes: account.clipMinutes.remaining,
    aiCredits: account.aiCredits.remaining,
    // Only ready videos with a known length can be priced and run.
    videoAssets: videos.assets
      .filter((a) => a.status === "ready" && a.durationSec)
      .map((a) => ({ id: a.id, title: a.name, durationSec: a.durationSec!, thumbnailUrl: a.thumbnailUrl })),
  };
}

export const autoClipKeys = { context: ["autoclip", "context"] as const };
export const useAutoClipContext = () => useQuery({ queryKey: autoClipKeys.context, queryFn: getAutoClipContext });
