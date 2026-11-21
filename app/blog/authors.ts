import type { BlogAuthor } from "./types";

/**
 * Bylines. Posts are credited to the founder, a real, named person, because
 * answer engines and Google's quality raters both look for who is behind a
 * piece; an anonymous "Clipiro Team" byline gave them nothing to check
 * (2026-11 SEO audit).
 *
 * Bylines that share a `slug` are the same entity wearing different hats: the
 * author hub indexes by slug, so they collapse into one /blog/author/<slug>
 * page instead of several near-identical ones — the thin-content pattern
 * Google's helpful-content signals penalise. `role` stays per-byline (it
 * describes the post, not the author), which is why the hub renders `bio`.
 *
 * The team byline is kept for posts no single person wrote; nothing uses it
 * today, and /blog/author/clipiro-team redirects to the founder's page
 * (next.config.ts) because that is where its posts went.
 */
const FOUNDER = {
  slug: "divyansh-verma",
  name: "Divyansh Verma",
  kind: "Person",
  metaDescription:
    "Divyansh Verma founded Clipiro and builds AutoClip. He writes about turning long videos into short clips, based on how creators actually use the product.",
  bio: "Founder and CEO of Clipiro. Divyansh builds AutoClip and the rest of the Clipiro workspace, and writes about turning long videos into short-form content from what creators actually do with the product.",
} as const;

const CLIPIRO_TEAM = {
  slug: "clipiro-team",
  name: "Clipiro Team",
  bio: "The people building Clipiro — writing about short-form video from the inside, based on what we ship and what creators actually do with it.",
} as const;

export const AUTHORS = {
  founder: { ...FOUNDER, role: "Founder" },
  founderProduct: { ...FOUNDER, role: "Founder · Product" },
  team: { ...CLIPIRO_TEAM, role: "Editorial" },
} satisfies Record<string, BlogAuthor>;
