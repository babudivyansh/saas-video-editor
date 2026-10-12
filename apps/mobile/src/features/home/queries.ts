import { useQuery } from "@tanstack/react-query";
import { assistant, me } from "@/lib/api";

// The Home tab's data: GET /home (balances, level, top clips, projects),
// GET /tools, and Clipiro AI's conversation (GET /assistant/messages).
export const homeKeys = {
  summary: ["home", "summary"] as const,
  tools: ["tools"] as const,
  assistant: ["assistant", "history"] as const,
};

export const useHomeSummary = () => useQuery({ queryKey: homeKeys.summary, queryFn: me.home });
export const useTools = () => useQuery({ queryKey: homeKeys.tools, queryFn: async () => (await me.tools()).tools, staleTime: 60 * 60 * 1000 });
export const useAssistantHistory = () => useQuery({ queryKey: homeKeys.assistant, queryFn: assistant.history });
