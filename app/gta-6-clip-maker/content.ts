// Copy for /gta-6-clip-maker, a use-case landing page for creators clipping
// GTA 6 streams in the launch weeks (game out 19 Nov 2026).
//
// Same shape as a tool page (app/tools/content.ts) so the page reuses the
// tool-page layout, plus the honesty box the tool pages don't need.
//
// Ground rules, checked in content.test.ts:
// - Plan limits are computed from lib/plans/tiers.ts, never typed in.
// - Nothing implies Rockstar or Take-Two endorse Clipiro, and nothing tells
//   creators they may monetize GTA footage: Rockstar's policy covers
//   non-commercial fan use, and that call is the creator's, not ours.
// - No Rockstar artwork, logos or footage anywhere on the page: the same
//   policy bars using the game's footage to promote a product.

import { CAPTION_FAMILIES, CAPTION_TEMPLATES } from "@clipiro/shared/caption-templates";
import { SOURCE_HOSTS_LABEL } from "@clipiro/shared/sources";
import {
  FREE_TIER_MONTHLY_BONUS_MINUTES,
  MAX_UPLOAD_BYTES_BY_TIER,
  TIER_MAX_AUTOCLIP_SOURCE_SECONDS,
  formatBytes,
  type TierId,
} from "@/lib/plans/tiers";
import type { ToolContent } from "@/app/tools/content";

export const ROCKSTAR_POLICY_URL = "https://support.rockstargames.com/articles/7bNaeoMFTV0iUDGhStTXvz/policy-on-posting-copyrighted-material";

export const NOT_AFFILIATED =
  "Clipiro is an independent product and is not affiliated with, endorsed by or sponsored by Rockstar Games or Take-Two Interactive. Grand Theft Auto and GTA are their trademarks.";

/** The caption families that suit gaming clips, in the order the page lists them. */
export const GAMING_CAPTION_FAMILY_IDS = ["retro", "neon", "hype"] as const;

export const GAMING_CAPTION_FAMILIES = GAMING_CAPTION_FAMILY_IDS.map((id) => {
  const family = CAPTION_FAMILIES.find((f) => f.id === id);
  if (!family) throw new Error(`caption family "${id}" is gone; update GAMING_CAPTION_FAMILY_IDS`);
  return { ...family, count: CAPTION_TEMPLATES.filter((t) => t.family === id).length };
});

function hours(tier: TierId): string {
  const sec = TIER_MAX_AUTOCLIP_SOURCE_SECONDS[tier];
  if (sec < 3600) return `${sec / 60} minutes`;
  return sec === 3600 ? "1 hour" : `${sec / 3600} hours`;
}

export interface UseCaseContent extends ToolContent {
  /** What the product does well and what it doesn't, said plainly. */
  bestFor: { works: string[]; doesNotWork: string[] };
}

export const GTA6_CONTENT: UseCaseContent = {
  h1: "Turn your GTA 6 streams into Shorts, Reels and TikToks",
  updatedAt: "2026-11-18",
  metaTitle: "GTA 6 Clip Maker — Stream VODs to Vertical Clips with AI",
  metaDescription:
    `Paste a Twitch or YouTube VOD of your GTA 6 stream and AutoClip finds the moments worth posting, captions them and cuts them vertical. ${FREE_TIER_MONTHLY_BONUS_MINUTES} free minutes a month.`,
  definition:
    "Clipiro's GTA 6 clip maker is AutoClip pointed at stream VODs: it picks the moments worth posting from what you say on stream, captions them and cuts them to vertical.",
  lede:
    "Paste the link to your Twitch or YouTube VOD, or upload the recording. AutoClip finds the moments worth posting, adds captions, cuts them to vertical and hands back clips ready for Shorts, Reels and TikTok.",
  steps: [
    {
      title: "Add your stream",
      body: `Paste a link (${SOURCE_HOSTS_LABEL}) or upload the file. Paid plans take recordings up to ${hours("studio")} long.`,
    },
    {
      title: "AutoClip finds the moments",
      body: "It reads what you say and how you say it, so the reactions, the shouting and the 'did that just happen' moments rise to the top, not random slices on a timer.",
    },
    {
      title: "Review and post",
      body: "Each clip comes back captioned and vertical. Keep the good ones, retime or restyle anything in the editor, then export.",
    },
  ],
  benefits: [
    {
      title: "Built for long streams",
      body: `Starter (free) takes ${hours("free")}, Creator ${hours("creator")}, Pro ${hours("pro")} and Agency ${hours("studio")} — files up to ${formatBytes(MAX_UPLOAD_BYTES_BY_TIER.studio)}. Long enough for a full launch-night session.`,
    },
    {
      title: "Straight from Twitch or YouTube",
      body: "Paste the VOD or clip link instead of downloading gigabytes and uploading them again. Live streams can be imported once the broadcast has ended.",
    },
    {
      title: "Caption looks for gaming",
      body: GAMING_CAPTION_FAMILIES.map((f) => `${f.name} (${f.count})`).join(", ") + " — pixel, glitch, neon and scoreboard styles made for gameplay clips.",
    },
    {
      title: "Priced per minute of stream",
      body: "One Clip Minute per minute of source video, however many clips come out of it. Re-running the same video within 7 days is free.",
    },
    {
      title: "Try it free",
      body: `The free plan includes ${FREE_TIER_MONTHLY_BONUS_MINUTES} AutoClip minutes a month, watermarked, with no card needed.`,
    },
    {
      title: "Facecam on top, gameplay below",
      body: "Pick the Gaming stream preset and each vertical clip stacks your webcam over the centre of the gameplay, instead of zooming in on your face and losing the game.",
    },
  ],
  bestFor: {
    works: [
      "Streams and videos where you talk: reactions, commentary, co-op chaos with friends",
      "Let's Play style recordings with a voice track",
      "Podcasts and talk shows about the game",
    ],
    doesNotWork: [
      "Silent gameplay with no commentary. AutoClip picks moments from what is said, so a recording with only game audio gives it nothing to choose from.",
    ],
  },
  faqs: [
    {
      question: "Can I post GTA 6 clips on YouTube, TikTok or Instagram?",
      answer:
        "That is Rockstar's call, not ours. Their policy on posting copyrighted Rockstar Games material covers non-commercial fan content and lists what gets removed, such as leaked pre-release footage, story spoilers and cutscene compilations. Read it before you post, and especially before you monetize anything.",
    },
    {
      question: "Does it work with Twitch VODs?",
      answer:
        "Yes. Paste the link to a past broadcast, highlight or clip and AutoClip imports it. A channel that is still live can't be imported until the broadcast has ended and the VOD is up. The VOD has to be public.",
    },
    {
      question: "How long can my stream be?",
      answer: `The free Starter plan takes recordings up to ${hours("free")}, Creator up to ${hours("creator")}, Pro up to ${hours("pro")} and Agency up to ${hours("studio")}. For a longer session, trim it into parts first.`,
    },
    {
      question: "Will my facecam and the gameplay both show?",
      answer:
        "Yes, with the Gaming stream preset (or the Gaming speaker mode): the top half of each vertical clip frames your webcam and the bottom half shows the centre of the gameplay. Without a webcam in the stream, clips show a centre crop of the gameplay.",
    },
    {
      question: "What clip length works best?",
      answer:
        "YouTube Shorts and Instagram Reels both allow up to three minutes, but gameplay clips usually work best at 30 to 60 seconds: one moment, set up fast, with the payoff before people scroll. You choose the length range before AutoClip runs.",
    },
    {
      question: "Does it work on gameplay without commentary?",
      answer:
        "Not well. AutoClip finds moments from what is said, so silent gameplay or game audio alone gives it nothing to pick from. It works best on streams and videos where you are talking.",
    },
    {
      question: "Will the clips have a watermark?",
      answer: `Clips from the free plan's ${FREE_TIER_MONTHLY_BONUS_MINUTES} monthly minutes carry a small Clipiro watermark. Every paid plan exports without one.`,
    },
    {
      question: "How much does it cost?",
      answer:
        "AutoClip is billed in Clip Minutes: one minute per minute of source video, however many clips it produces. Plans are month-to-month with a 3-day money-back guarantee; current prices are on the pricing page.",
    },
    {
      question: "Is Clipiro made by Rockstar?",
      answer: NOT_AFFILIATED,
    },
  ],
};
