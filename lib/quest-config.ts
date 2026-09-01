export const QUEST_DEFINITIONS = [
  { id: "join-community",    title: "Join the community",   xp: 500, trigger: "manual" as const },
  { id: "first-clip",        title: "Create your first clip", xp: 300, trigger: "auto" as const },
  { id: "hear-yourself-out", title: "Hear yourself out",    xp: 200, trigger: "auto"   as const },
  { id: "picture-this",      title: "Picture this",         xp: 200, trigger: "auto"   as const },
  { id: "first-video",       title: "Generate your first video", xp: 200, trigger: "auto" as const },
  { id: "first-export",      title: "Export a project",     xp: 200, trigger: "auto"   as const },
  { id: "upgraded-plan",     title: "Upgrade your plan",    xp: 300, trigger: "auto"   as const },
  { id: "explore-toolbox",   title: "Explore the toolbox",  xp: 150, trigger: "auto"   as const },
  { id: "complete-profile",  title: "Complete your profile", xp: 100, trigger: "auto"  as const },
  { id: "track-account",     title: "Track your first account", xp: 250, trigger: "auto" as const },
  { id: "refer-friend",      title: "Refer a friend",       xp: 400, trigger: "auto"   as const },
] as const;

export type QuestId = typeof QUEST_DEFINITIONS[number]["id"];

// Derived so adding a quest can never desync the progress bar / "X/TOTAL" caption.
export const TOTAL_XP = QUEST_DEFINITIONS.reduce((sum, q) => sum + q.xp, 0);

// Single source of truth for ranks. `minXp` are absolute XP thresholds; the top
// rank tracks TOTAL_XP so "all quests complete" always equals the top rank even
// as quests are added. `reward` is the one-time bonus-credit grant for first
// crossing that rank (0 = no reward). xpToLevel / levelColor / RANK_REWARDS all
// derive from this list so nothing drifts.
export const RANKS = [
  { level: "Beginner",       minXp: 0,        color: "#6b7280", reward: 0  },
  { level: "Creator",        minXp: 500,      color: "#2563eb", reward: 5  },
  { level: "Pro Creator",    minXp: 1100,     color: "#7c3aed", reward: 10 },
  { level: "Clipiro Master", minXp: TOTAL_XP, color: "#d97706", reward: 20 },
] as const;

export type Rank = typeof RANKS[number];

// Ranks that grant a reward when first reached, in ascending threshold order.
export const RANK_REWARDS = RANKS.filter(r => r.reward > 0);

/** Sum the xp of the given completed quest ids. Shared by the API routes and
 *  the reward logic so the number is computed one way everywhere. */
export function earnedXpFor(completedIds: Iterable<string>): number {
  const set = completedIds instanceof Set ? completedIds : new Set(completedIds);
  return QUEST_DEFINITIONS.reduce((sum, q) => sum + (set.has(q.id) ? q.xp : 0), 0);
}

export function xpToLevel(xp: number): string {
  let current = RANKS[0].level as string;
  for (const r of RANKS) if (xp >= r.minXp) current = r.level;
  return current;
}

export function levelColor(level: string): string {
  return RANKS.find(r => r.level === level)?.color ?? RANKS[0].color;
}
