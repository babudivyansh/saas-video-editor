import type { BlogAuthor } from "./types";

/**
 * Role-based bylines — no fabricated individual authors, since Clipiro's
 * editorial content isn't attributed to specific people yet.
 *
 * All three entries deliberately share one `slug`. They are the same entity
 * wearing different hats, and the author hub indexes by slug, so this produces
 * a single /blog/author/clipiro-team page listing every post rather than three
 * near-identical pages for one author — which is exactly the thin-content
 * pattern Google's helpful-content signals penalise.
 *
 * `role` stays per-byline (it describes the post, not the author), which is
 * why the hub page renders `bio` rather than any one role.
 *
 * When real named authors exist, give each their own slug and set
 * `kind: "Person"`; the hub splits into separate pages automatically.
 */
const CLIPIRO_TEAM = {
  slug: "clipiro-team",
  name: "Clipiro Team",
  bio: "The people building Clipiro — writing about short-form video from the inside, based on what we ship and what creators actually do with it.",
} as const;

export const AUTHORS = {
  editorial: { ...CLIPIRO_TEAM, role: "Editorial" },
  product: { ...CLIPIRO_TEAM, role: "Product" },
  growth: { ...CLIPIRO_TEAM, role: "Growth" },
} satisfies Record<string, BlogAuthor>;
