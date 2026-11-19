export const PRIMARY_GOALS = [
  {
    id: "auto-clip",
    label: "Turn long videos into clips",
    description: "Upload a podcast or stream and get viral-ready shorts automatically.",
    href: "/dashboard/create/auto-clip",
  },
  {
    id: "image",
    label: "Generate AI images",
    description: "Create images from a text prompt.",
    href: "/dashboard/tools/image-generator",
  },
  {
    id: "voiceover",
    label: "Generate AI voiceovers",
    description: "Turn a script into natural-sounding narration.",
    href: "/dashboard/tools/voiceover",
  },
  {
    id: "editor",
    label: "Edit my own footage",
    description: "Trim, crop, and stitch your own clips together.",
    href: "/dashboard/cut-and-crop",
  },
] as const;

export type PrimaryGoalId = typeof PRIMARY_GOALS[number]["id"];

// "What do you make?" on the welcome screen, saved to User.intendedUse through
// PATCH /api/auth/profile (which validates against the same ids). Asked
// because 137 of 138 signups in Oct–Nov 2026 had no intendedUse — it was only
// ever asked in Settings — so nobody could say who was signing up.
export const INTENDED_USE_OPTIONS = [
  { id: "gaming", label: "Gaming streams" },
  { id: "podcast", label: "Podcasts" },
  { id: "education", label: "Talks & lessons" },
  { id: "content_creator", label: "Vlogs & other videos" },
  { id: "business_marketing", label: "Business / marketing" },
  { id: "other", label: "Something else" },
] as const;

// Which quest (lib/quest-config.ts) corresponds to actually having done the
// thing a welcome-screen goal selection promised — used by FeatureHint to
// nudge a user back toward their stated goal if they haven't gotten there yet.
export const GOAL_TO_QUEST: Record<PrimaryGoalId, string> = {
  "auto-clip": "first-clip",
  image: "picture-this",
  voiceover: "hear-yourself-out",
  editor: "first-export",
};
