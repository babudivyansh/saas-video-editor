import type { BlogPost } from "../types";
import { AUTHORS } from "../authors";
import { AUTOCLIP_RERUN_FREE_WINDOW_DAYS } from "@/lib/plans/tiers";

// Three per-platform guides, one file: they share their AutoClip steps and only
// differ in the platform specifics. Platform limits change; each states its
// figures with the month they took effect so a stale one is easy to spot.

const AUTOCLIP_STEPS = (aspectNote: string) => [
  {
    heading: "Cut the clips with AutoClip",
    text: `Upload the full recording, or paste a link to a video you own. AutoClip transcribes it, scores self-contained moments and returns a shortlist of clips, already captioned and reframed. ${aspectNote} The run costs one Clip Minute per minute of source video, and re-running the same video within ${AUTOCLIP_RERUN_FREE_WINDOW_DAYS} days to try different settings is free.`,
  },
  {
    heading: "Review before you export",
    text: "Read each clip's first three seconds as a stranger would. If the hook lands late, trim the start; if a word is wrong, fix it in the transcript and the captions follow. Drop any clip that needs the rest of the episode to make sense.",
  },
];

export const podcastToYoutubeShorts: BlogPost = {
  slug: "podcast-to-youtube-shorts",
  category: "Guide",
  title: "How to turn a podcast into YouTube Shorts",
  metaDescription:
    "Turn a podcast episode into YouTube Shorts: pick self-contained moments, cut them vertical with captions, and use them to send viewers to the episode.",
  publishedAt: "2026-11-04",
  updatedAt: "2026-11-04",
  author: AUTHORS.founder,
  intro:
    "To turn a podcast into YouTube Shorts, pick moments that make sense on their own, cut each to vertical 9:16 with burned-in captions, and keep it under three minutes, YouTube's Shorts limit since October 2024. Then link each Short to the full episode so it feeds the long-form channel.",
  body: [
    {
      heading: "What makes a podcast moment work as a Short",
      text: "A good Short is a complete thought: a claim and its payoff, a question and a surprising answer, a story with an ending. Moments that need the previous ten minutes of context fail, however good they sound in the episode. Look for spikes of energy, laughter, disagreement and specific numbers.",
    },
    ...AUTOCLIP_STEPS("Choose 9:16 for Shorts; smart reframing keeps whoever is talking in frame."),
    {
      heading: "Posting so Shorts help the full episode",
      text: "Title each Short with the claim it makes, not the episode number. Use YouTube's related-video link on the Short to point at the full episode, and post Shorts from the same channel as the long-form show so viewers who like a clip can find the rest. Spread a single episode's clips over the week rather than posting them all at once.",
    },
  ],
  faqs: [
    {
      question: "How long can a YouTube Short be?",
      answer:
        "Up to three minutes, since October 2024. Most podcast Shorts perform best well under that: 30 to 60 seconds is enough for one complete point.",
    },
    {
      question: "How many Shorts can I get from one episode?",
      answer:
        "A one-hour conversation usually holds somewhere around eight to twelve moments that stand on their own. Post the strongest first and space the rest out.",
    },
    {
      question: "Do Shorts need captions?",
      answer: "Yes. Many viewers scroll with the sound off, and captions also help the hook land in the first seconds.",
    },
  ],
  closing:
    "Pick complete thoughts, cut them vertical with captions, and link every Short back to the episode. Run your latest episode through AutoClip to get the shortlist in minutes.",
};

export const videoToInstagramReels: BlogPost = {
  slug: "turn-long-videos-into-instagram-reels",
  category: "Guide",
  title: "How to turn long videos into Instagram Reels",
  metaDescription:
    "Turn a long video into Instagram Reels: pick moments that hook in the first seconds, cut them 9:16 with captions, and keep text clear of the Reels UI.",
  publishedAt: "2026-11-04",
  updatedAt: "2026-11-04",
  author: AUTHORS.founder,
  intro:
    "To turn a long video into Instagram Reels, cut short, self-contained moments to vertical 9:16, burn in captions placed clear of the Reels buttons and caption area, and open on the hook. Reels can run up to three minutes since January 2025, but the first two seconds still decide whether anyone stays.",
  body: [
    {
      heading: "Choose moments that work on mute",
      text: "Reels autoplay in a feed where many people watch without sound, so pick moments whose point comes across in the captions and on-screen action. A visual payoff or a strong one-line statement beats a slow build.",
    },
    ...AUTOCLIP_STEPS("Choose 9:16 for Reels."),
    {
      heading: "Keep captions out of the interface",
      text: "Instagram overlays the caption, audio label and action buttons on the bottom and right of a Reel. Keep burned-in captions in the middle third of the frame so they aren't covered, and use a caption style with enough contrast for bright and dark footage alike.",
    },
    {
      heading: "Write the post, not just the clip",
      text: "The first line of the Reel's caption shows in the feed, so make it the reason to watch. Add a cover frame that reads at thumbnail size, and post consistently rather than all at once.",
    },
  ],
  faqs: [
    {
      question: "How long can an Instagram Reel be?",
      answer:
        "Up to three minutes when recorded or uploaded in the Instagram app, since January 2025. Shorter Reels are easier to watch to the end, which matters more than length.",
    },
    {
      question: "What aspect ratio should a Reel be?",
      answer: "Vertical 9:16, at 1080×1920. Other ratios work but leave bars or get cropped in the feed.",
    },
    {
      question: "Can I post the same clip as a Reel and a YouTube Short?",
      answer:
        "Yes. Export once at 9:16 and post to both; just remove any platform-specific watermark or text before cross-posting.",
    },
  ],
  closing:
    "Pick moments that make sense on mute, keep captions clear of the interface and lead with the hook. Upload your next long video to AutoClip and you'll have a week of Reels to choose from.",
};

export const videoToFacebookReels: BlogPost = {
  slug: "turn-long-videos-into-facebook-reels",
  category: "Guide",
  title: "How to turn long videos into Facebook Reels",
  metaDescription:
    "Repurpose long videos as Facebook Reels: choose clips for an older, conversation-led audience, cut them vertical with captions and reuse your Instagram Reels.",
  publishedAt: "2026-11-04",
  updatedAt: "2026-11-04",
  author: AUTHORS.founder,
  intro:
    "To turn long videos into Facebook Reels, cut complete moments to vertical 9:16, add burned-in captions, and post them from your Page. Facebook's Reels audience often skews older than Instagram's and responds to clear, practical and conversational clips, so pick moments for that audience rather than reposting whatever trended elsewhere.",
  body: [
    {
      heading: "Pick clips for the Facebook audience",
      text: "Advice, explainers, stories and opinions that start a discussion tend to travel on Facebook because they get shared and commented on. Look for moments where a speaker makes a clear point people will want to agree or argue with.",
    },
    ...AUTOCLIP_STEPS("Choose 9:16 for Reels."),
    {
      heading: "Reuse your Instagram Reels, carefully",
      text: "If you already post Reels on Instagram, Meta lets you share them to Facebook too. That's a fast start, but watch which clips actually get shared on Facebook and lean into that kind of moment instead of mirroring Instagram exactly.",
    },
    {
      type: "callout",
      tone: "tip",
      title: "Check the current length limit",
      text: "Facebook's maximum Reel length has changed several times. Check it in the Reels composer before you export, and keep clips well under it either way.",
    },
  ],
  faqs: [
    {
      question: "What aspect ratio do Facebook Reels use?",
      answer: "Vertical 9:16, ideally 1080×1920, the same as Instagram Reels and YouTube Shorts.",
    },
    {
      question: "Should I post the same Reels on Facebook and Instagram?",
      answer:
        "You can, and it's a good way to start. Over time, compare which clips get shares and comments on Facebook and pick more of those for it.",
    },
    {
      question: "Do Facebook Reels need captions?",
      answer: "Yes. Many people scroll Facebook with the sound off, and burned-in captions keep the clip readable either way.",
    },
  ],
  closing:
    "Cut complete, discussion-worthy moments to 9:16 with captions and let Facebook's own engagement tell you which kind to make more of. AutoClip gives you the shortlist from one upload.",
};
