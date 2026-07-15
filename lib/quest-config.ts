export const QUEST_DEFINITIONS = [
  { id: "join-community",    title: "Join the community",   xp: 500, trigger: "manual" as const },
  { id: "first-clip",        title: "Create your first clip", xp: 300, trigger: "auto" as const },
  { id: "hear-yourself-out", title: "Hear yourself out",    xp: 200, trigger: "auto"   as const },
  { id: "picture-this",      title: "Picture this",         xp: 200, trigger: "auto"   as const },
  { id: "first-video",       title: "Generate your first video", xp: 200, trigger: "auto" as const },
  { id: "first-export",      title: "Export a project",     xp: 200, trigger: "auto"   as const },
  { id: "upgraded-plan",     title: "Upgrade your plan",    xp: 300, trigger: "auto"   as const },
] as const;

export type QuestId = typeof QUEST_DEFINITIONS[number]["id"];
export const TOTAL_XP = 1900;
export const QUEST_COMPLETION_CREDITS = 5;

export function xpToLevel(xp: number): string {
  if (xp >= 1900) return "Clipiro Master";
  if (xp >= 1100) return "Pro Creator";
  if (xp >= 500)  return "Creator";
  return "Beginner";
}

export function levelColor(level: string): string {
  if (level === "Clipiro Master") return "#d97706"; // gold
  if (level === "Pro Creator")    return "#7c3aed"; // purple
  if (level === "Creator")        return "#2563eb"; // blue
  return "#6b7280";                                 // gray
}
