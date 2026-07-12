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
