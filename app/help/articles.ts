// Help-center articles — same plain-data pattern as app/blog/posts.ts (no
// MDX/CMS pipeline; see that file's header note). Grouped by category for the
// index page.

export interface HelpArticle {
  slug: string;
  category: string;
  title: string;
  summary: string;
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
    paragraphs: [
      { text: "Create an account with your email or Google. New accounts start on the free plan with bonus credits, so you can try the core tools before paying anything." },
      { lead: "Upload a video.", text: "From the dashboard, open Auto Clips and upload a long-form video — a podcast episode, webinar, stream VOD, or YouTube export. Uploads support large files via chunked upload, so a spotty connection won't restart you from zero." },
      { lead: "Let Auto Clips analyze it.", text: "The AI transcribes your video, scores the strongest moments, and proposes a shortlist of clips with captions and smart reframing for vertical formats. Nothing is charged until you confirm which clips to keep." },
      { lead: "Review, tweak, export.", text: "Trim a clip's edges, restyle captions, or open it in the full editor for deeper changes. Exported clips land in your Clips library, ready to download and post." },
      { text: "The in-app product tour (Dashboard → restart tour from Settings) walks through all of this interactively." },
    ],
  },
  {
    slug: "how-credits-work",
    category: "Credits & billing",
    title: "How credits work",
    summary: "What credits pay for, how they're deducted, and when they expire.",
    paragraphs: [
      { text: "Credits are Clipiro's single currency for AI work: generating auto clips, running AI tools, rendering exports. Each tool shows its credit cost up front, and costs scale with video length where processing time does too." },
      { lead: "Buckets.", text: "Your balance can hold three kinds of credits: bonus credits (signup and promo grants — used first, they expire), subscription credits (refilled monthly with your plan), and purchased top-up credits (never expire while your account is active). Spending always drains in that order, so nothing expiring is wasted." },
      { lead: "Rollover.", text: "Unused subscription credits roll over month to month up to twice your monthly allowance." },
      { lead: "Refunds on failure.", text: "If a job fails partway, the unused portion of what you were charged is automatically refunded to your balance. Every movement appears in your billing history." },
      { text: "Running low mid-month? Buy a top-up pack from the Billing page, or enable auto-topup so renders never stall." },
    ],
  },
  {
    slug: "free-plan-limits",
    category: "Credits & billing",
    title: "Free plan limits",
    summary: "What's included free, and what upgrading unlocks.",
    paragraphs: [
      { text: "The free plan includes a monthly drip of credits, a storage quota for uploads, and watermarked auto-clip exports capped at 720p." },
      { lead: "Watermark.", text: "Free exports carry a small Clipiro watermark in the corner. Paid plans remove it and export at full resolution." },
      { lead: "Storage.", text: "Uploads count against your plan's storage quota. Delete old source videos from Assets to free space — exported clips you've downloaded are safe to clear." },
      { text: "Upgrading from the Pricing page takes effect immediately: your subscription credits arrive on the spot and the watermark disappears from new exports." },
    ],
  },
  {
    slug: "auto-clips-walkthrough",
    category: "Auto Clips",
    title: "Auto Clips, step by step",
    summary: "Every setting on the Auto Clips screen and what it does.",
    paragraphs: [
      { lead: "Clip length & count.", text: "Set a min/max duration (15–60s is the sweet spot for Reels and Shorts) and how many candidates you want. More candidates cost nothing extra at analysis time — you're only charged for clips you confirm." },
      { lead: "Aspect & reframing.", text: "Pick 9:16, 1:1, or 16:9. Smart reframing tracks faces and speakers so vertical crops stay centered on who's talking; tune zoom strength, tracking speed, and smoothness if the defaults feel too tight or too loose." },
      { lead: "Captions.", text: "Choose a caption style before analysis, or restyle any clip afterwards. Animated word-by-word captions are available on every style." },
      { lead: "Cleanup options.", text: "Silence removal trims dead air; filler-word removal cuts the ums and likes. Both are per-run toggles." },
      { lead: "Instructions.", text: "The instructions box steers the AI's selection — try \"focus on actionable advice\" or \"find the funniest exchanges\"." },
      { text: "After analysis you land on the review screen: keep, trim, or drop each candidate. Only kept clips are charged and rendered." },
    ],
  },
  {
    slug: "export-and-watermark",
    category: "Tools & editor",
    title: "Exporting and render quality",
    summary: "Formats, resolutions, and why an export might look different from the preview.",
    paragraphs: [
      { text: "Exports render server-side with FFmpeg at your project's aspect ratio — 1080×1920 for 9:16 — as H.264 MP4 with AAC audio, ready for every major platform." },
      { lead: "Free plan.", text: "Exports are capped at 720p with a corner watermark. Paid plans export full-resolution and clean." },
      { lead: "Preview vs export.", text: "The editor canvas approximates some things (text shadows blur softer in preview, effects use CSS stand-ins), but positions, timings, captions, filters, effects, and transitions are all burned into the export for real." },
      { text: "Renders run on a queue — you can leave the page and the job keeps going. Finished clips appear in your Clips library with a download link." },
    ],
  },
  {
    slug: "ai-tools-overview",
    category: "Tools & editor",
    title: "The AI tools, at a glance",
    summary: "What each tool in the toolbox does and roughly what it costs.",
    paragraphs: [
      { text: "Beyond Auto Clips, the Tools section covers one-shot jobs: background remover, speech enhancement, vocal remover, voice changer, voiceover generation, image and video generation, face swap, subtitle remover, and downloaders for your own social content." },
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
    paragraphs: [
      { text: "Cancel any time from the Billing page. Your plan stays active until the end of the paid period; after that you drop to the free plan and unused subscription credits expire per the rollover rules." },
      { lead: "Refunds.", text: "Purchased credit packs and subscription charges follow the refund policy — broadly, unused purchases within the policy window qualify. Read the full policy for the exact terms." },
      { text: "Refunds approved by support are returned to the original payment method via Razorpay, typically within 5–7 business days." },
    ],
  },
];

export function getHelpArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}
