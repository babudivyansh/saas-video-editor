// Help-center articles — same plain-data pattern as app/blog/posts.ts (no
// MDX/CMS pipeline; see that file's header note). Grouped by category for the
// index page.
//
// Plan numbers come from lib/plans/tiers.ts rather than being typed in: three
// of these articles still promised "30 Clip Minutes a month" and "only kept
// clips are charged" weeks after both stopped being true.

import {
  AUTOCLIP_RERUN_FREE_WINDOW_DAYS,
  BONUS_MINUTES_EXPIRY_DAYS,
  FREE_TIER_MONTHLY_BONUS_CREDITS,
  FREE_TIER_MONTHLY_BONUS_MINUTES,
  FREE_TIER_SIGNUP_MINUTES,
  OVERFLOW_MINUTES_PER_CREDIT,
} from "@/lib/plans/tiers";

export interface HelpArticle {
  slug: string;
  category: string;
  title: string;
  /** One-line lede shown on the article and in the index. */
  summary: string;
  /** The search-result description: a direct answer, 140–160 characters. */
  metaDescription: string;
  /** ISO date the article was last checked against the product. */
  updatedAt: string;
  paragraphs: { lead?: string; text: string }[];
}

export const HELP_CATEGORIES = [
  "Getting started",
  "Credits & billing",
  "Auto Clips",
  "Tools & editor",
  "Account & security",
] as const;

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "getting-started",
    category: "Getting started",
    title: "Getting started with Clipiro",
    summary: "From signup to your first clip in about five minutes.",
    metaDescription: `Sign up free, upload a long video and AutoClip returns captioned vertical clips in minutes. New accounts start with ${FREE_TIER_SIGNUP_MINUTES} Clip Minutes and need no card.`,
    updatedAt: "2026-11-04",
    paragraphs: [
      { text: `Create an account with your email or Google. New accounts start on the free plan with ${FREE_TIER_SIGNUP_MINUTES} Clip Minutes, then get ${FREE_TIER_MONTHLY_BONUS_MINUTES} watermarked Clip Minutes and ${FREE_TIER_MONTHLY_BONUS_CREDITS} AI credits every month, so you can try Auto Clips and the AI tools before paying anything.` },
      { lead: "Upload a video.", text: "From the dashboard, open Auto Clips and upload a long-form video — a podcast episode, webinar, stream VOD, or YouTube export. Uploads support large files via chunked upload, so a spotty connection won't restart you from zero." },
      { lead: "Let Auto Clips analyze it.", text: "The AI transcribes your video, scores the strongest moments, and proposes a shortlist of clips with captions and smart reframing for vertical formats. A run costs one Clip Minute per minute of your video, however many clips it finds." },
      { lead: "Review, tweak, export.", text: "Trim a clip's edges, restyle captions, or open it in the full editor for deeper changes. Exported clips land in your Clips library, ready to download and post." },
      { text: "The in-app product tour (Dashboard → restart tour from Settings) walks through all of this interactively." },
    ],
  },
  {
    slug: "how-credits-work",
    category: "Credits & billing",
    title: "How Clip Minutes and credits work",
    summary: "The two balances, what each pays for, and when they expire.",
    metaDescription: "Clipiro has two balances: Clip Minutes pay for AutoClip, one per minute of source video, and AI credits pay for the other tools. Unused allowances roll over.",
    updatedAt: "2026-11-04",
    paragraphs: [
      { text: "Your account has two balances. Clip Minutes pay for Auto Clips: 1 minute per minute of video you upload, however many clips it makes. AI credits pay for everything else — the AI tools and dubbing. Both are shown in the top bar." },
      { lead: "Clip Minutes.", text: `A 45-minute podcast uses 45 Clip Minutes whether you ask for 3 clips or 20. Re-running the same video within ${AUTOCLIP_RERUN_FREE_WINDOW_DAYS} days is free, and a run that fails is refunded in full. If you run out, you can top up, or tick the option to pay the rest in AI credits (${OVERFLOW_MINUTES_PER_CREDIT} minutes = 1 credit).` },
      { lead: "AI credits.", text: "Each tool shows its cost before you run it. Tools that work on audio or text are priced by length — for example, voiceover costs 1 credit per 300 characters — so short jobs cost less." },
      { lead: "Buckets.", text: `Each balance can hold bonus (signup, promos and rewards — used first, they expire after ${BONUS_MINUTES_EXPIRY_DAYS} days), subscription (refilled monthly with your plan) and purchased top-ups (never expire while your account is active). Spending drains them in that order, so nothing expiring is wasted.` },
      { lead: "Rollover.", text: "Unused subscription minutes and credits roll over month to month, up to twice your monthly allowance." },
      { lead: "Refunds on failure.", text: "If a job fails partway, the unused portion of what you were charged is automatically refunded. Every movement appears in your billing history." },
      { text: "Running low mid-month? Buy a minute pack or a credit pack from Billing → Top Up." },
    ],
  },
  {
    slug: "free-plan-limits",
    category: "Credits & billing",
    title: "Free plan limits",
    summary: "What's included free, and what upgrading unlocks.",
    metaDescription: `The free plan includes ${FREE_TIER_MONTHLY_BONUS_MINUTES} watermarked Clip Minutes and ${FREE_TIER_MONTHLY_BONUS_CREDITS} AI credits a month, the free utilities and 720p exports. Paid plans remove the watermark.`,
    updatedAt: "2026-11-04",
    paragraphs: [
      { text: `The free plan includes ${FREE_TIER_MONTHLY_BONUS_MINUTES} watermarked Clip Minutes and ${FREE_TIER_MONTHLY_BONUS_CREDITS} AI credits every month (plus ${FREE_TIER_SIGNUP_MINUTES} Clip Minutes when you sign up), a storage quota for uploads, and watermarked auto-clip exports capped at 720p. Free minutes and credits expire after ${BONUS_MINUTES_EXPIRY_DAYS} days.` },
      { lead: "Watermark.", text: "Free exports carry a small Clipiro watermark in the corner. Paid plans remove it and export at full resolution." },
      { lead: "Storage.", text: "Uploads count against your plan's storage quota. Delete old source videos from Assets to free space — exported clips you've downloaded are safe to clear." },
      { text: "Upgrading from the Pricing page takes effect immediately: your subscription minutes and credits arrive on the spot and the watermark disappears from new exports." },
    ],
  },
  {
    slug: "auto-clips-walkthrough",
    category: "Auto Clips",
    title: "Auto Clips, step by step",
    summary: "Every setting on the Auto Clips screen and what it does.",
    metaDescription: "Every AutoClip setting explained: clip length and count, aspect ratio and smart reframing, caption style, silence and filler-word removal, and AI instructions.",
    updatedAt: "2026-11-04",
    paragraphs: [
      { lead: "Clip length & count.", text: "Set a min/max duration (15–60s is the sweet spot for Reels and Shorts) and how many candidates you want. The run costs the same however many clips you ask for: one Clip Minute per minute of source video." },
      { lead: "Aspect & reframing.", text: "Pick 9:16, 1:1, or 16:9. Smart reframing tracks faces and speakers so vertical crops stay centered on who's talking; tune zoom strength, tracking speed, and smoothness if the defaults feel too tight or too loose." },
      { lead: "Captions.", text: "Choose a caption style before analysis, or restyle any clip afterwards. Animated word-by-word captions are available on every style." },
      { lead: "Cleanup options.", text: "Silence removal trims dead air; filler-word removal cuts the ums and likes. Both are per-run toggles." },
      { lead: "Instructions.", text: "The instructions box steers the AI's selection — try \"focus on actionable advice\" or \"find the funniest exchanges\"." },
      { text: "After analysis you land on the review screen: keep, trim, or drop each candidate. Only kept clips are rendered, and dropping one doesn't change the cost." },
    ],
  },
  {
    slug: "export-and-watermark",
    category: "Tools & editor",
    title: "Exporting and render quality",
    summary: "Formats, resolutions, and why an export might look different from the preview.",
    metaDescription: "Clipiro exports H.264 MP4 in full resolution, or 4K from the editor on Pro and Studio. Free exports are 720p with a small watermark. Why previews can differ.",
    updatedAt: "2026-11-04",
    paragraphs: [
      { text: "Exports render server-side with FFmpeg at your project's aspect ratio — 1080×1920 for 9:16 — as H.264 MP4 with AAC audio, ready for every major platform." },
      { lead: "Free plan.", text: "Exports are capped at 720p with a corner watermark. Paid plans export full-resolution and clean, and Pro and Studio can export editor projects in 4K." },
      { lead: "Preview vs export.", text: "The editor canvas approximates some things (text shadows blur softer in preview, effects use CSS stand-ins), but positions, timings, captions, filters, effects, and transitions are all burned into the export for real." },
      { text: "Renders run on a queue — you can leave the page and the job keeps going. Finished clips appear in your Clips library with a download link." },
    ],
  },
  {
    slug: "ai-tools-overview",
    category: "Tools & editor",
    title: "The AI tools, at a glance",
    summary: "What each tool in the toolbox does and roughly what it costs.",
    metaDescription: "What each Clipiro AI tool does and how it's priced: credits by length or per output, shown before you run it. The compressor, MP3 converter and audio balancer are free.",
    updatedAt: "2026-11-04",
    paragraphs: [
      { text: "Beyond Auto Clips, the Tools section covers one-shot jobs: background remover, speech enhancement, vocal remover, voice changer, voiceover generation, image generation, face swap, subtitle remover, and downloaders for your own social content." },
      { lead: "Costs.", text: "Each tool page shows its credit cost before you run it. Duration-based tools (audio/video processing) scale with input length; generation tools charge per output." },
      { lead: "Free tools.", text: "The compressor, MP3 converter, and audio balancer are free and don't touch your credit balance." },
      { text: "If a tool is temporarily disabled you'll see a notice instead of a charge — this happens during upstream provider incidents and resolves without action from you." },
    ],
  },
  {
    slug: "two-factor-authentication",
    category: "Account & security",
    title: "Setting up two-factor authentication",
    summary: "Protect your account with an authenticator app and recovery codes.",
    metaDescription: "Turn on two-factor authentication in Settings → Security with any TOTP app (Google Authenticator, 1Password, Authy), and keep your one-time recovery codes safe.",
    updatedAt: "2026-11-04",
    paragraphs: [
      { text: "Go to Settings → Security and choose Enable two-factor authentication. Scan the QR code with any TOTP app (Google Authenticator, 1Password, Authy) and confirm with a code to switch it on." },
      { lead: "Recovery codes.", text: "You'll get one-time recovery codes at setup — store them somewhere safe. Each works exactly once if you lose access to your authenticator." },
      { lead: "How login changes.", text: "After your password (or Google sign-in), you'll be asked for a 6-digit code. Codes are single-use within their time window." },
      { text: "Lost both your authenticator and recovery codes? Contact support from your account email and we'll verify ownership manually." },
    ],
  },
  {
    slug: "api-keys",
    category: "Account & security",
    title: "Using API keys",
    summary: "Create scoped keys and automate clipping from your own code.",
    metaDescription: "Create read or read+write Clipiro API keys in Settings → API keys, then create projects, start AutoClip jobs and fetch clips from your own code. Revoke keys any time.",
    updatedAt: "2026-11-04",
    paragraphs: [
      { text: "Settings → API keys lets you mint keys with read or read+write scopes and optional expiry. The full key is shown once at creation — copy it then." },
      { lead: "What the API covers.", text: "Create projects, start AutoClip analysis jobs, and poll clip status/downloads. See the API docs page for endpoints, examples, and rate limits." },
      { lead: "Safety.", text: "Keys are rate-limited per key and can be revoked instantly from the same page. Revoke immediately if a key leaks — usage counts on the page help you spot anything unexpected." },
    ],
  },
  {
    slug: "refunds-and-cancellation",
    category: "Credits & billing",
    title: "Refunds and cancelling your plan",
    summary: "How cancellation works and when purchases are refundable.",
    metaDescription: "Cancel any Clipiro plan from Billing and keep access until the paid period ends. Paid plans carry a 3-day money-back guarantee; refunds return through Razorpay.",
    updatedAt: "2026-11-04",
    paragraphs: [
      { text: "Cancel any time from the Billing page. Your plan stays active until the end of the paid period; after that you drop to the free plan and unused subscription credits expire per the rollover rules." },
      { lead: "Refunds.", text: "Every paid plan carries a 3-day money-back guarantee, and purchased minute and credit packs follow the refund policy — broadly, unused purchases within the policy window qualify. Read the full policy for the exact terms." },
      { text: "Refunds approved by support are returned to the original payment method via Razorpay, typically within 5–7 business days." },
    ],
  },
];

export function getHelpArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}
