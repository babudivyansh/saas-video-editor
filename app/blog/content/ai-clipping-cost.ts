import type { BlogPost } from "../types";
import { AUTHORS } from "../authors";
import { COMPETITORS, COMPETITORS_CHECKED_ON, clipiroCostPerMinute } from "@/app/compare/data";
import { AUTOCLIP_RERUN_FREE_WINDOW_DAYS } from "@/lib/plans/tiers";

// Figures come from app/compare/data.ts — the same source as /compare — so the
// post and the comparison pages can never quote two different prices.

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const perMinute = clipiroCostPerMinute();
// Not monotonic by plan (Creator and Studio tie, Pro sits a little above), so
// sort rather than assume the biggest plan is the cheapest per minute.
const byPrice = [...perMinute].sort((a, b) => a.perMinute - b.perMinute);
const cheapest = byPrice[0];
const priciest = byPrice[byPrice.length - 1];
const competitorPrices = COMPETITORS.map((c) => [c.name, c.rows.find((r) => r.label === "Paid plans")?.them ?? "", c.rows.find((r) => r.label === "What you pay for")?.them ?? ""]);

export const aiClippingCost: BlogPost = {
  slug: "how-much-does-ai-clipping-cost",
  category: "Growth",
  title: "How much does AI video clipping cost?",
  metaDescription:
    "What AI clipping tools charge, how their billing units differ (minutes, credits, hours) and how to work out your real cost per hour of video.",
  publishedAt: "2026-11-04",
  updatedAt: "2026-11-04",
  author: AUTHORS.founder,
  intro: `AI clipping tools usually cost between a few hundred and a few thousand rupees a month, but the sticker price is the least useful number. What decides your bill is the billing unit (minutes of video, credits or hours of analysis) and how many hours of source video you upload. On Clipiro, a minute of clipping costs from ${rupees(cheapest.perMinute)} to ${rupees(priciest.perMinute)}, depending on the plan.`,
  body: [
    {
      heading: "The three ways clipping tools bill you",
      text: "Almost every AI clipper meters one of three things. Some charge per minute of source video you upload, however many clips come out. Some sell credits, where a credit buys some amount of processing that the pricing page may or may not spell out. A few sell hours of AI analysis a month. The unit matters more than the price, because it decides what a wasted run costs you: if you upload a 90-minute episode and only two clips are any good, a per-minute tool still charges for 90 minutes.",
    },
    {
      lead: "Per minute of source video.",
      text: `This is the most predictable model. A one-hour podcast costs 60 minutes whether you keep three clips or fifteen. Clipiro bills this way, in Clip Minutes, and re-running the same video within ${AUTOCLIP_RERUN_FREE_WINDOW_DAYS} days is free, so trying different clip lengths or caption styles doesn't cost a second time.`,
    },
    {
      lead: "Credits.",
      text: "Credits are flexible but harder to compare, because the exchange rate between a credit and a minute of video is set by each tool and can change. Before buying, find the line on the pricing page or help centre that says how many credits a minute of upload uses.",
    },
    {
      lead: "Hours of analysis.",
      text: "Selling hours is the same idea as minutes with a bigger unit. Watch for a second limit on exports, because some plans cap how much you can render separately from how much you can analyse.",
    },
    {
      heading: "What a minute costs on Clipiro",
      text: "Clipiro's plans include a fixed number of Clip Minutes a month. Dividing the monthly price by those minutes gives the cost of clipping one minute of video on each plan:",
    },
    {
      type: "table",
      caption: "Clipiro plans, monthly billing, prices in rupees including GST. Yearly billing costs less.",
      columns: ["Plan", "Price a month", "Clip Minutes", "Cost per minute"],
      rows: perMinute.map((p) => [p.name, `₹${p.monthlyInr.toLocaleString("en-IN")}`, p.minutes.toLocaleString("en-IN"), rupees(p.perMinute)]),
    },
    {
      heading: "What other clipping tools list",
      text: "For comparison, these are the paid plans and billing units three other popular clippers state on their own pricing pages. They bill in US dollars, so the rupee cost also moves with the exchange rate and your card's foreign-transaction fee.",
    },
    {
      type: "table",
      caption: `Figures from each tool's own pricing page, checked ${COMPETITORS_CHECKED_ON}. Prices change; check before you buy.`,
      columns: ["Tool", "Paid plans", "Billed by"],
      rows: competitorPrices,
    },
    {
      heading: "How to work out your real cost",
      text: "Add up how many hours of long-form video you record in a typical month, multiply by 60, and pick the plan whose minutes cover that with a little headroom. A weekly one-hour podcast is about 260 minutes a month. Then add what you'd otherwise pay for the pieces that come separately: dubbing, voiceover and caption styling are included on some tools and extra on others. The cheapest plan on paper is often not the cheapest once those are counted.",
    },
    {
      type: "callout",
      tone: "tip",
      title: "Paying for a business?",
      text: "If you're registered for GST in India, a tool that issues a GST tax invoice with your GSTIN lets you claim the input tax credit. Clipiro's prices include GST and every paid purchase gets a tax invoice.",
    },
  ],
  faqs: [
    {
      question: "Is AI clipping cheaper than hiring an editor?",
      answer:
        "Usually, for the first pass. A clipping tool finds and captions candidate clips in minutes for a monthly fee, while an editor bills by the hour. Many creators use both: the tool for the shortlist, an editor or themselves for the final polish.",
    },
    {
      question: "Do clipping tools charge for clips I don't use?",
      answer:
        "Tools that bill per minute of source video charge for the whole upload, however many clips you keep. That makes the cost predictable but means a weak recording still costs its full length.",
    },
    {
      question: "Is there a free AI clipping tool?",
      answer:
        "Most clippers have a free plan with a small monthly allowance and a watermark. Clipiro's free plan includes watermarked Clip Minutes every month and needs no card.",
    },
  ],
  closing:
    "Work out your monthly hours of source video first, then compare tools on the cost of those minutes rather than on the headline price. If you'd like to see what a month of your own content costs on Clipiro, start on the free plan and check the minutes a real episode uses.",
};
