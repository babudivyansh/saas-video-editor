import { useQuery } from "@tanstack/react-query";
import { me } from "@/lib/api";
import { getAssistantHistory } from "@mocks/home";

// The Home tab's data: GET /home (balances, level, top clips, projects) and
// GET /tools. The assistant's conversation stays a mock until Phase 13.
export const homeKeys = {
  summary: ["home", "summary"] as const,
  tools: ["tools"] as const,
  assistant: ["assistant", "history"] as const,
};

export const useHomeSummary = () => useQuery({ queryKey: homeKeys.summary, queryFn: me.home });
export const useTools = () => useQuery({ queryKey: homeKeys.tools, queryFn: async () => (await me.tools()).tools, staleTime: 60 * 60 * 1000 });
export const useAssistantHistory = () => useQuery({ queryKey: homeKeys.assistant, queryFn: getAssistantHistory });
