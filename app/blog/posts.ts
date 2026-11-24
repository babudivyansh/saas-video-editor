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
import { aiClippingCost } from "./content/ai-clipping-cost";
import { hindiCaptionsShortsReels } from "./content/hindi-captions-shorts-reels";
import { podcastToYoutubeShorts, videoToFacebookReels, videoToInstagramReels } from "./content/platform-guides";
import { aiClippingIndianCreators } from "./content/ai-clipping-indian-creators";
import { clipGta6Streams } from "./content/clip-gta-6-streams";
import { blackFriday2026 } from "./content/black-friday-2026";

export const BLOG_POSTS: BlogPost[] = [
  // Time-limited (ends 30 Nov 2026): listed first while the sale runs.
  blackFriday2026,
  podcastToViralClips,
  hooksThatStopTheScroll,
  smarterClipDetection,
  postingCadence,
  captionStylesWatchTime,
  localizingClipsGlobalAudiences,
  aiClippingCost,
  hindiCaptionsShortsReels,
  podcastToYoutubeShorts,
  videoToInstagramReels,
  videoToFacebookReels,
  aiClippingIndianCreators,
  clipGta6Streams,
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}
