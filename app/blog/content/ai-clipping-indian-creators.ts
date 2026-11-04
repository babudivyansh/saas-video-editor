import type { BlogPost } from "../types";
import { AUTHORS } from "../authors";
import { CLIPIRO_PLANS } from "@/app/compare/data";
import { CAPTION_TEMPLATES } from "@clipiro/shared/caption-templates";
import { DUB_LANGUAGES } from "@/lib/languages";
import { FREE_TIER_MONTHLY_BONUS_MINUTES } from "@/lib/plans/tiers";

const entry = CLIPIRO_PLANS[0];
const desiCount = CAPTION_TEMPLATES.filter((t) => t.family === "desi" || t.family === "fest").length;
const indianDub = DUB_LANGUAGES.filter((l) => ["hi", "ta"].includes(l.code)).map((l) => l.label);

export const aiClippingIndianCreators: BlogPost = {
  slug: "ai-clipping-for-indian-creators",
  category: "Guide",
  title: "AI clipping for Indian creators: rupees, GST and Hindi captions",
  metaDescription:
    "What Indian creators should check in an AI clipping tool: rupee billing, GST invoices, UPI payment, Hindi and Hinglish captions, and dubbing into Indian languages.",
  publishedAt: "2026-11-04",
  updatedAt: "2026-11-04",
  author: AUTHORS.founder,
  intro:
    "Most AI clipping tools are priced in US dollars for a US audience. For an Indian creator or agency that adds a currency markup on every renewal, no GST invoice to claim input credit against, and captions that often break on Hindi. Here's what to check before you pick one.",
  body: [
    {
      heading: "Billing in rupees, and why it matters",
      text: "A dollar-priced plan costs a different amount every month as the exchange rate moves, and most Indian cards add a foreign-transaction fee on top. Some cards and UPI mandates also refuse recurring foreign charges. A tool that bills in rupees through an Indian payment gateway avoids all three.",
    },
    {
      lead: "On Clipiro,",
      text: `plans are priced in rupees, starting at ₹${entry.monthlyInr} a month for ${entry.minutes} Clip Minutes, with a free plan of ${FREE_TIER_MONTHLY_BONUS_MINUTES} watermarked minutes a month. Payment goes through Razorpay, which takes cards, UPI, netbanking and wallets, and subscriptions renew on a card e-mandate or UPI Autopay.`,
    },
    {
      heading: "GST invoices for creators who run a business",
      text: "If you're registered for GST, a tax invoice that carries your GSTIN lets you claim the GST you paid as input tax credit. Dollar-billed tools invoice from abroad, so there is usually nothing to claim. Clipiro's prices include GST, and each purchase gets a GST tax invoice; add your GSTIN in billing details before you buy so it appears on the invoice.",
    },
    {
      heading: "Hindi and Hinglish captions that render correctly",
      text: `Devanagari needs complex text shaping, or vowel signs and conjuncts come out broken. Check an exported clip, not just the preview. Clipiro shapes Devanagari in the export and has ${desiCount} caption templates in its Hindi & Hinglish and Desi Festival families, built for Indian content.`,
    },
    {
      heading: "Dubbing for audiences in other Indian languages",
      text: `A clip that works in Hindi can be dubbed for another audience instead of re-recorded. Clipiro dubs into ${DUB_LANGUAGES.length} languages, including ${indianDub.join(" and ")}, with captions translated and re-timed to the new audio.`,
    },
    {
      type: "callout",
      tone: "tip",
      title: "A quick checklist",
      text: "Before you subscribe to any clipper: Is the price in rupees? Do you get a GST invoice with your GSTIN? Can you pay with UPI? Do Hindi captions export cleanly? Does the free plan let you test a real episode?",
    },
  ],
  faqs: [
    {
      question: "Can I pay for Clipiro with UPI?",
      answer:
        "Yes. Checkout runs on Razorpay and accepts cards, UPI, netbanking and wallets, and subscriptions can renew through UPI Autopay.",
    },
    {
      question: "Does Clipiro give a GST invoice?",
      answer:
        "Yes. Prices include GST and every purchase gets a GST tax invoice. Add your GSTIN in your billing details before purchasing for it to appear on the invoice.",
    },
    {
      question: "Does Clipiro support Hindi captions?",
      answer:
        "Yes, in Devanagari and Hinglish, with Devanagari shaped correctly in the exported video and dedicated Hindi caption templates.",
    },
  ],
  closing:
    "If you create for Indian audiences, the currency, the invoice and how Hindi renders will matter more month to month than a small difference in list price. Try a real episode on Clipiro's free plan and check all three.",
};
