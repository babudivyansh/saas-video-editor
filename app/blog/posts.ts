// Blog content lives here as plain data — no MDX/CMS pipeline yet. Each post's
// full content lives in its own file under app/blog/content/; this file just
// aggregates them into the list the listing/detail pages render from.
export type { BlogParagraph, BlogFaq, BlogAuthor, BlogPost } from "./types";
import type { BlogPost } from "./types";
import { podcastToViralClips } from "./content/podcast-to-viral-clips";
import { hooksThatStopTheScroll } from "./content/hooks-that-stop-the-scroll";
import { smarterClipDetection } from "./content/smarter-clip-detection";
import { postingCadence } from "./content/posting-cadence";
import { captionStylesWatchTime } from "./content/caption-styles-watch-time";
import { localizingClipsGlobalAudiences } from "./content/localizing-clips-global-audiences";

export const BLOG_POSTS: BlogPost[] = [
  podcastToViralClips,
  hooksThatStopTheScroll,
  smarterClipDetection,
  postingCadence,
  captionStylesWatchTime,
  localizingClipsGlobalAudiences,
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}
