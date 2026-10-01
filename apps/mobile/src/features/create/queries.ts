import type { GeneratedMedia } from "@clipiro/shared";
import { useQuery } from "@tanstack/react-query";
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
