import type { BlogPost } from "../types";
import { AUTHORS } from "../authors";
import { bfPackBonus, bfPlanBonus } from "@/lib/campaigns/black-friday";
import { BONUS_MINUTES_EXPIRY_DAYS } from "@/lib/plans/tiers";

// Black Friday 2026 announcement. The offer itself lives in
// lib/campaigns/black-friday.ts (dates, eligibility, bonus maths); the numbers
// below run through the same bonus functions so the post can't promise more
// than checkout grants. Pack and plan minute amounts match prisma/seed.ts.
// The images are rendered from HTML (public/blog/black-friday-2026/).

const dir = "/blog/black-friday-2026";
const fmt = (n: number) => n.toLocaleString("en-IN");
const pack = (m: number) => [`${fmt(m)} Clip Minutes`, `${fmt(m + bfPackBonus(m))} Clip Minutes`, "Never"];
const plan = (name: string, m: number) => [name, `${fmt(m)} a month`, `${fmt(m + bfPlanBonus(m))} in month one`];

export const blackFriday2026: BlogPost = {
  slug: "black-friday-2026-double-clip-minutes",
  category: "Product",
  title: "Black Friday 2026: double Clip Minutes on every pack and new plan",
  seoTitle: "Black Friday 2026: double Clip Minutes",
  metaDescription:
    "Clipiro's Black Friday sale: 2× Clip Minutes on every minute pack and a doubled first month on new plans. No code needed. Ends 30 Nov 2026, 11:59 PM IST.",
  publishedAt: "2026-11-24",
  updatedAt: "2026-11-24",
  author: AUTHORS.founderProduct,
  hero: {
    src: `${dir}/hero.webp`,
    alt: "Black Friday 2026 at Clipiro: double your Clip Minutes, 24 to 30 November, IST.",
    width: 1600,
    height: 900,
  },
  intro:
    "Our Black Friday sale is live. Until Sunday 30 November, every Clip Minutes pack comes with double the minutes, and any new Creator, Pro or Agency plan gets its first month of Clip Minutes doubled. Prices don't change and there's no code to enter: you check out as usual and the bonus is added for you.",
  body: [
    {
      heading: "What's in the sale",
      text: "We didn't want a discount you have to hunt for a coupon to get. Instead, the thing you actually spend in Clipiro, Clip Minutes, is doubled. AutoClip uses one Clip Minute per minute of video you upload, however many clips it finds, so double the minutes means you can put twice as much footage through it for the same money.",
    },
    {
      lead: "Two offers, one window.",
      text: "The sale runs from 24 November 2026 at 5:00 PM IST to 30 November 2026 at 11:59 PM IST. It covers minute packs and new plans, in INR and USD.",
    },
    {
      heading: "Offer 1: every minute pack, doubled",
      text: "Buy any Clip Minutes pack during the sale and you get twice the minutes on it. The bonus goes into the same bucket as the pack, so it never expires either. There's no limit: if you buy two packs, both are doubled.",
    },
    {
      type: "image",
      image: {
        src: `${dir}/packs.webp`,
        alt: "Minute packs during Black Friday: 100 minutes becomes 200, 300 becomes 600, and 1,000 becomes 2,000, at the same price.",
        width: 1600,
        height: 900,
      },
    },
    {
      type: "table",
      caption: "Clip Minutes packs during the Black Friday 2026 sale",
      columns: ["Pack", "You get during the sale", "Expires"],
      rows: [pack(100), pack(300), pack(1000)],
    },
    {
      type: "callout",
      tone: "note",
      text: "AI credit packs aren't part of the sale. Only Clip Minutes packs are doubled.",
    },
    {
      heading: "Offer 2: your first month on a new plan, doubled",
      text: "Start a new Creator, Pro or Agency plan during the sale, monthly or yearly, and your first month's Clip Minutes are doubled. The bonus arrives with your first paid charge.",
    },
    {
      type: "image",
      image: {
        src: `${dir}/plans.webp`,
        alt: "New plans during Black Friday: Creator gets 400 Clip Minutes in month one instead of 200, Pro gets 800 instead of 400, and Agency gets 2,000 instead of 1,000.",
        width: 1600,
        height: 900,
      },
    },
    {
      type: "table",
      caption: "First-month Clip Minutes on new plans during the Black Friday 2026 sale",
      columns: ["Plan", "Usual Clip Minutes", "During the sale"],
      rows: [plan("Creator", 200), plan("Pro", 400), plan("Agency", 1000)],
    },
    {
      lead: "A few rules, so nothing surprises you.",
      text: `The plan bonus is once per account, and it's for new plans: upgrading or renewing a plan that's already running doesn't count. It doubles Clip Minutes only, not AI credits. Like other bonus minutes, the extra month expires ${BONUS_MINUTES_EXPIRY_DAYS} days after it's added, so plan to use it in your first month.`,
    },
    {
      heading: "If you're on a Pro trial",
      text: "Trials count. If you start a Pro trial during the sale, the bonus is locked in when you start, and it's added when your first payment goes through, even if that lands after 30 November. If your trial started before the sale, you still get the bonus as long as your first payment lands before the sale ends.",
    },
    {
      heading: "How to claim it",
      text: "There's nothing to remember. Open Pricing, pick a pack or plan, and pay the way you normally would. While the sale is live, the bonus is applied at checkout and added to your account with the payment.",
    },
    {
      type: "image",
      image: {
        src: `${dir}/how-it-works.webp`,
        alt: "How it works: 1. Pick a pack or plan. 2. Check out as usual in INR or USD. 3. Get double minutes, added with the payment.",
        width: 1600,
        height: 900,
      },
    },
    {
      type: "cta",
      heading: "Get double Clip Minutes",
      body: "The sale ends Sunday 30 November 2026, 11:59 PM IST.",
      label: "See packs and plans",
      href: "/pricing",
    },
    {
      heading: "What to do with the extra minutes",
      text: "Double the minutes is most useful if you have footage waiting. A good place to start is the back catalogue: old podcast episodes, past streams and long videos that never got clipped. Paste a YouTube or Twitch link, or upload the file, and AutoClip finds the moments, reframes them to vertical and captions them.",
    },
    {
      lead: "Plan a month of posting.",
      text: "With a full month of minutes, you can clip a few long videos at once and schedule what comes out, rather than clipping one at a time. Our posting cadence guide covers how often to post so the clips don't compete with each other.",
    },
    {
      type: "callout",
      tone: "warning",
      title: "The sale ends Sunday 30 November at 11:59 PM IST",
      text: "Bonuses are only added to orders placed while the sale is live. After that, packs and plans go back to their usual minutes.",
    },
  ],
  faqs: [
    {
      question: "Do I need a coupon code for the Black Friday sale?",
      answer: "No. While the sale is live, the bonus is applied automatically at checkout. Just buy a pack or start a plan as you normally would.",
    },
    {
      question: "When does the Clipiro Black Friday sale end?",
      answer: "Sunday 30 November 2026 at 11:59 PM IST. Orders placed after that don't get the bonus.",
    },
    {
      question: "Do the bonus minutes expire?",
      answer: `Bonus minutes from a minute pack never expire, just like the pack itself. The extra first-month minutes on a new plan expire ${BONUS_MINUTES_EXPIRY_DAYS} days after they're added.`,
    },
    {
      question: "I already have a paid plan. Can I still use the sale?",
      answer: "Yes, with minute packs: every pack you buy during the sale is doubled. The first-month plan bonus is only for new plans, so upgrades and renewals don't qualify.",
    },
    {
      question: "Are AI credits doubled too?",
      answer: "No. The sale doubles Clip Minutes only. AI credit packs and the AI credits that come with plans stay the same.",
    },
    {
      question: "Does the sale work if I pay in US dollars?",
      answer: "Yes. Both offers apply in INR and USD, on monthly and yearly plans.",
    },
  ],
  closing:
    "That's the whole offer: twice the Clip Minutes, the same prices, no code. If you've got long videos sitting unclipped, this is the cheapest week of the year to work through them. The sale ends Sunday 30 November at 11:59 PM IST.",
};
