export const PRIMARY_GOALS = [
  {
    id: "auto-clip",
    label: "Turn long videos into clips",
    description: "Upload a podcast or stream and get viral-ready shorts automatically.",
    href: "/dashboard/create/auto-clip",
  },
  {
    id: "video",
    label: "Generate AI video",
    description: "Create video from a text prompt with VEO3.",
    href: "/dashboard/tools/video-generator",
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

// Which quest (lib/quest-config.ts) corresponds to actually having done the
// thing a welcome-screen goal selection promised — used by FeatureHint to
// nudge a user back toward their stated goal if they haven't gotten there yet.
export const GOAL_TO_QUEST: Record<PrimaryGoalId, string> = {
  "auto-clip": "first-clip",
  video: "first-video",
  image: "picture-this",
  voiceover: "hear-yourself-out",
  editor: "first-export",
};
