// Shared constants for the Rating & Review system (product-level reviews of
// Clipiro, one per user — see prisma/schema.prisma's Review model).

export interface FeatureUsedOption {
  value: string;
  label: string;
}

export const FEATURE_USED_OPTIONS: FeatureUsedOption[] = [
  { value: "auto_clips", label: "Auto Clips" },
  { value: "ai_video_editor", label: "AI Video Editor" },
  { value: "ai_tools", label: "AI Tools" },
  { value: "assets", label: "Assets" },
  { value: "billing", label: "Billing" },
  { value: "team_workspaces", label: "Team Workspaces" },
];

export const FEATURE_USED_VALUES = FEATURE_USED_OPTIONS.map((o) => o.value) as [string, ...string[]];

export function featureUsedLabel(value: string): string {
  return FEATURE_USED_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export const REVIEW_RATING_MIN = 1;
export const REVIEW_RATING_MAX = 5;

export const REVIEW_TITLE_MAX = 120;
export const REVIEW_BODY_MIN = 20;
export const REVIEW_BODY_MAX = 4000;

export type ReviewStatus = "pending" | "published" | "rejected" | "hidden";
export type ReviewSortOption = "recent" | "helpful" | "rating_high" | "rating_low";
