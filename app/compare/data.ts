// Comparison pages at /compare/<slug>, and the shared facts the cost-of-
// clipping and Indian-creators blog posts quote.
//
// Rules for this file, because a wrong number about a competitor is worse than
// no page:
//   - Every competitor figure comes from that competitor's own pricing page,
//     read on COMPETITORS_CHECKED_ON, and is linked from the page. Anything the
//     official page didn't state is left out or marked "not stated", never
//     filled in from a third-party review.
//   - Clipiro's own figures come from code (tiers.ts, languages.ts, the caption
//     library) or, for plan prices and minute grants (DB rows), from CLIPIRO_PLANS
//     below, which data.test.ts checks against prisma/seed.ts.
//   - Re-check every competitor at least once a quarter and bump the date; the
//     page shows it, so a stale date is visible rather than silent.

import { CAPTION_TEMPLATES } from "@clipiro/shared/caption-templates";
import { DUB_LANGUAGES } from "@/lib/languages";
import { FREE_TIER_MONTHLY_BONUS_MINUTES, TIER_MAX_AUTOCLIP_SOURCE_SECONDS } from "@/lib/plans/tiers";

export const COMPETITORS_CHECKED_ON = "2026-11-04";

/** Monthly list prices in rupees and Clip Minutes per month, as seeded (data.test.ts). */
export const CLIPIRO_PLANS = [
  { name: "Creator", monthlyInr: 999, minutes: 200 },
  { name: "Pro", monthlyInr: 2199, minutes: 400 },
  { name: "Agency", monthlyInr: 4999, minutes: 1000 },
] as const;

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const hours = (seconds: number) => {
  const m = seconds / 60;
  return m < 60 ? `${m} minutes` : m === 60 ? "1 hour" : `${m / 60} hours`;
};

/** Rupees per Clip Minute on each paid plan, monthly billing, rounded to the paisa. */
export function clipiroCostPerMinute() {
  return CLIPIRO_PLANS.map((p) => ({ ...p, perMinute: Math.round((p.monthlyInr / p.minutes) * 100) / 100 }));
}

export const CLIPIRO_FACTS = {
  freePlan: `${FREE_TIER_MONTHLY_BONUS_MINUTES} watermarked Clip Minutes a month, 720p, no card`,
  paidPlans: CLIPIRO_PLANS.map((p) => `${p.name} ${inr(p.monthlyInr)}/mo (${p.minutes.toLocaleString("en-IN")} min)`).join(" · "),
  billingUnit: "1 Clip Minute per minute of source video, however many clips",
  currency: "Indian rupees, with a GST tax invoice",
  sourceLength: `Up to ${hours(TIER_MAX_AUTOCLIP_SOURCE_SECONDS.free)} free, up to ${hours(TIER_MAX_AUTOCLIP_SOURCE_SECONDS.studio)} on Agency`,
  captions: `${CAPTION_TEMPLATES.length} caption templates, including Devanagari Hindi and Hinglish`,
  dubbing: `AI dubbing into ${DUB_LANGUAGES.length} languages`,
  export: "1080p on paid plans; 4K from the editor on Pro and Agency",
};

export interface CompareRow {
  label: string;
  them: string;
  us: string;
}

export interface Competitor {
  slug: string;
  name: string;
  pricingUrl: string;
  /** 40–60 words: the answer to "X vs Clipiro", quotable on its own. */
  summary: string;
  metaDescription: string;
  rows: CompareRow[];
  /** Honest: when the reader should pick the competitor. */
  pickThem: string[];
  pickUs: string[];
  faqs: { question: string; answer: string }[];
}

const NOT_STATED = "Not stated on their pricing page";

export const COMPETITORS: Competitor[] = [
  {
    slug: "opus-clip",
    name: "Opus Clip",
    pricingUrl: "https://www.opus.pro/pricing",
    summary:
      "Opus Clip and Clipiro both turn long videos into captioned vertical clips. Opus Clip bills in US dollars, from $15 a month for Starter and $29 for Pro. Clipiro bills in rupees with GST invoices, from ₹999 a month, and charges one Clip Minute per minute of source video.",
    metaDescription:
      "Opus Clip vs Clipiro: prices, billing currency, free plans, captions and dubbing compared side by side, with figures from each tool's own pricing page.",
    rows: [
      { label: "Free plan", them: "$0; exports carry a watermark, clips rendered up to 1080p and kept 3 days", us: CLIPIRO_FACTS.freePlan },
      { label: "Paid plans", them: "Starter $15/mo · Pro $29/mo · Business custom", us: CLIPIRO_FACTS.paidPlans },
      { label: "Billing currency", them: "US dollars", us: CLIPIRO_FACTS.currency },
      { label: "What you pay for", them: `Credits (${NOT_STATED.toLowerCase()} how many a minute costs)`, us: CLIPIRO_FACTS.billingUnit },
      { label: "Upload limit", them: "Up to 10 GB a video free, 30 GB on paid plans", us: CLIPIRO_FACTS.sourceLength },
      { label: "Captions", them: "Animated caption templates (watermarked on free)", us: CLIPIRO_FACTS.captions },
      { label: "Dubbing", them: NOT_STATED, us: CLIPIRO_FACTS.dubbing },
    ],
    pickThem: [
      "You pay in US dollars anyway and want a tool with a longer track record.",
      "You need their Business plan's custom terms for a larger team.",
    ],
    pickUs: [
      "You want to pay in rupees and claim GST input credit on a proper tax invoice.",
      "You publish in Hindi or Hinglish and want captions designed for Devanagari.",
      "You want the price tied to minutes of video, not to how many clips you keep.",
    ],
    faqs: [
      {
        question: "Is Clipiro cheaper than Opus Clip?",
        answer:
          "It depends on how much video you clip and which currency you pay in. Clipiro's Creator plan is ₹999 a month for 200 Clip Minutes and Opus Clip's Starter is $15 a month. Compare the minutes each plan includes against how many hours you upload, using each tool's current pricing page.",
      },
      {
        question: "Can I move from Opus Clip to Clipiro?",
        answer:
          "Yes. There is nothing to migrate: upload your source videos to Clipiro, or paste a link to a video you own, and AutoClip finds the clips again. Your caption styles need picking again from Clipiro's template library.",
      },
    ],
  },
  {
    slug: "vizard",
    name: "Vizard",
    pricingUrl: "https://vizard.ai/pricing",
    summary:
      "Vizard and Clipiro both clip long videos into shorts and both meter usage by minutes of uploaded video. Vizard's free plan gives 60 upload minutes a month at 720p, and its paid plans start at 600 minutes in US dollars. Clipiro bills in rupees with GST invoices, from ₹999 a month.",
    metaDescription:
      "Vizard vs Clipiro: free plans, upload minutes, export quality, billing currency and captions compared, with figures from each tool's own pricing page.",
    rows: [
      { label: "Free plan", them: "60 upload minutes a month, 720p, watermarked", us: CLIPIRO_FACTS.freePlan },
      { label: "Paid plans", them: "Creator and Business, from 600 upload minutes a month (prices in USD on their page)", us: CLIPIRO_FACTS.paidPlans },
      { label: "Billing currency", them: "US dollars", us: CLIPIRO_FACTS.currency },
      { label: "What you pay for", them: "Upload minutes (credits)", us: CLIPIRO_FACTS.billingUnit },
      { label: "Export quality", them: "720p free, up to 4K on paid plans", us: CLIPIRO_FACTS.export },
      { label: "Captions", them: NOT_STATED, us: CLIPIRO_FACTS.captions },
      { label: "Dubbing", them: NOT_STATED, us: CLIPIRO_FACTS.dubbing },
    ],
    pickThem: [
      "You need 4K AutoClip-style exports on the cheapest paid plan.",
      "You clip a lot of hours a month and their 600-minute entry plan fits your volume.",
    ],
    pickUs: [
      "You want to pay in rupees on a GST invoice.",
      "You make Hindi or Hinglish content and want captions built for Devanagari.",
      "You want dubbing and the AI tools on the same balance as clipping.",
    ],
    faqs: [
      {
        question: "Do Vizard and Clipiro charge the same way?",
        answer:
          "Broadly, yes: both meter by minutes of uploaded video rather than by clips produced. Clipiro charges one Clip Minute per minute of source video and lets you re-run the same video free within 7 days.",
      },
      {
        question: "Which has the better free plan?",
        answer: `Vizard's free plan lists 60 upload minutes a month at 720p. Clipiro's gives ${FREE_TIER_MONTHLY_BONUS_MINUTES} watermarked Clip Minutes a month at 720p, plus a one-off allowance at signup. Both watermark free exports.`,
      },
    ],
  },
  {
    slug: "2short",
    name: "2short",
    pricingUrl: "https://2short.ai/#pricing",
    summary:
      "2short is a low-cost clipper built around YouTube Shorts, with a free tier of 30 minutes of analysis a month and paid plans from $9.90. Clipiro clips any uploaded video for Shorts, Reels and Facebook, bills in rupees with GST invoices from ₹999 a month, and adds dubbing and AI tools.",
    metaDescription:
      "2short vs Clipiro: free tiers, monthly analysis minutes, billing currency, captions and dubbing compared, with figures from each tool's own pricing page.",
    rows: [
      { label: "Free plan", them: "Starter: 30 minutes of AI video analysis a month", us: CLIPIRO_FACTS.freePlan },
      { label: "Paid plans", them: "Lite $9.90/mo (5 h) · Pro $19.90/mo (15 h) · Premium $49.90/mo (50 h)", us: CLIPIRO_FACTS.paidPlans },
      { label: "Billing currency", them: "US dollars", us: CLIPIRO_FACTS.currency },
      { label: "What you pay for", them: "Hours of AI video analysis a month", us: CLIPIRO_FACTS.billingUnit },
      { label: "Exports", them: "60 min of server-side exports on Lite, unlimited on Pro and Premium", us: CLIPIRO_FACTS.export },
      { label: "Captions", them: NOT_STATED, us: CLIPIRO_FACTS.captions },
      { label: "Dubbing", them: NOT_STATED, us: CLIPIRO_FACTS.dubbing },
    ],
    pickThem: [
      "You only make YouTube Shorts and want the lowest US-dollar price per hour of analysis.",
      "You clip many hours a month and Premium's 50 hours fits your volume.",
    ],
    pickUs: [
      "You post to Reels and Facebook as well as Shorts.",
      "You want rupee billing with a GST invoice.",
      "You want Hindi captions, dubbing and the AI tools in the same account.",
    ],
    faqs: [
      {
        question: "Is 2short cheaper than Clipiro?",
        answer:
          "Per hour of video, 2short's US-dollar plans are cheaper on paper. Clipiro bills in rupees with a GST invoice, includes dubbing and AI tools on the same account, and charges per minute of source video.",
      },
      {
        question: "Does Clipiro work with YouTube videos?",
        answer:
          "Yes. Upload the video file, or paste a link to a YouTube video you own or have the rights to, and AutoClip cuts it into vertical clips.",
      },
    ],
  },
];

export function getCompetitor(slug: string): Competitor | undefined {
  return COMPETITORS.find((c) => c.slug === slug);
}
