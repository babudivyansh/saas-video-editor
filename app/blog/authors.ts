import type { BlogAuthor } from "./types";

// Role-based bylines — no fabricated individual authors, since Clipiro's
// editorial content isn't attributed to specific people yet.
export const AUTHORS = {
  editorial: { name: "Clipiro Team", role: "Editorial" },
  product: { name: "Clipiro Team", role: "Product" },
  growth: { name: "Clipiro Team", role: "Growth" },
} satisfies Record<string, BlogAuthor>;
