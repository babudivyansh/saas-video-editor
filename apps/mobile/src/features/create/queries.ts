import { CAPTION_TEMPLATE_CATALOG, IMAGE_MODEL_CATALOG, type Account, type PlanTier } from "@clipiro/shared";
import { useQuery } from "@tanstack/react-query";
import { assets, editorTools, me } from "@/lib/api";

// The Create tab's data, from the API. The caption styles and image models
// are the web's own catalogues, copied into @clipiro/shared (pinned by
// lib/mobile-create-schema.test.ts), so they need no request.
export const createKeys = {
  /** The account (plan and balances) — the same query as Assets' plan check. */
  context: ["account"] as const,
  voices: ["voices"] as const,
  /** Under "assets", so anything that changes Assets refreshes them too. */
  results: (kind: "image" | "audio") => ["assets", "ai-results", kind] as const,
};

const HOUR = 60 * 60 * 1000;
const toContext = (a: Account) => ({ plan: a.plan.tier, clipMinutes: a.clipMinutes.remaining, aiCredits: a.aiCredits.remaining });
/** Plan and balances, for prices, locks and the credit pill. */
export const useCreateContext = () => useQuery({ queryKey: createKeys.context, queryFn: me.account, select: toContext });
export const useCaptionTemplates = () => ({ data: CAPTION_TEMPLATE_CATALOG, isPending: false as const, isError: false as const, refetch: () => {} });
export const useImageModels = () => ({ data: IMAGE_MODEL_CATALOG, isPending: false as const, isError: false as const, refetch: () => {} });
export const useVoices = () => useQuery({ queryKey: createKeys.voices, queryFn: editorTools.voices, staleTime: HOUR });
/** What the AI tools made lately (Assets → AI Assets), newest first. */
export const useRecentResults = (kind: "image" | "audio") => useQuery({ queryKey: createKeys.results(kind), queryFn: async () => (await assets.list({ ai: true, kind })).assets });

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
