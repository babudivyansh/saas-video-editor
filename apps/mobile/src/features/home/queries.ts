import { useQuery } from "@tanstack/react-query";
import { getAssistantHistory, getHomeSummary, getTools } from "@mocks/home";

// The Home tab's data. Phase 5 swaps the mock functions for the API client;
// the keys and the screens stay the same.
export const homeKeys = {
  summary: ["home", "summary"] as const,
  tools: ["tools"] as const,
  assistant: ["assistant", "history"] as const,
};

export const useHomeSummary = () => useQuery({ queryKey: homeKeys.summary, queryFn: getHomeSummary });
export const useTools = () => useQuery({ queryKey: homeKeys.tools, queryFn: getTools, staleTime: 60 * 60 * 1000 });
export const useAssistantHistory = () => useQuery({ queryKey: homeKeys.assistant, queryFn: getAssistantHistory });
