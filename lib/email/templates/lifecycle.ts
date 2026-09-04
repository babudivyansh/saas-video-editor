// Welcome, onboarding drip, re-engagement and the first-video upsell.
// All opt-out-able marketing/product mail.

import type { EmailDocument } from "../layout";
import { html } from "../html";
import { greet, plural } from "../format";
import { APP_URL, PRODUCT_NAME } from "../tokens";

const DASHBOARD_URL = `${APP_URL}/dashboard`;
const PRICING_URL = `${APP_URL}/pricing`;

export function welcome(p: { firstName: string; credits: number }): EmailDocument {
  const name = greet(p.firstName);
  return {
    subject: `Welcome to ${PRODUCT_NAME}, ${name} — here are your ${p.credits} free credits`,
    preheader: `${p.credits} credits are already in your account. Your first video takes about two minutes.`,
    blocks: [
      { kind: "heading", text: `Welcome to ${PRODUCT_NAME}, ${name}` },
      { kind: "paragraph", text: "You're all set. Start making AI-powered videos in minutes." },
      {
        kind: "hero",
        label: "Your starting credits",
        value: String(p.credits),
        caption: "ready to use right now",
        tone: "brand",
      },
      {
        kind: "list",
        title: "Get started in three steps",
        marker: "number",
        items: ["Go to your dashboard", "Pick a video style or tool", "Export your first AI video"],
      },
      { kind: "button", href: DASHBOARD_URL, label: "Go to dashboard" },
      {
        kind: "paragraph",
        tone: "fine",
        text: "Each credit is one AI render. Start with a short clip to see the quality.",
      },
    ],
  };
}

export function onboardingDay1(p: { name: string; creditsLeft: number }): EmailDocument {
  return {
    subject: `Your ${p.creditsLeft} ${PRODUCT_NAME} credits are waiting — here's how to use them`,
    preheader: "Your first AI video takes less than two minutes. Three ideas inside.",
    blocks: [
      { kind: "heading", text: `Your ${p.creditsLeft} credits are waiting, ${greet(p.name)}` },
      {
        kind: "paragraph",
        text: "You signed up yesterday but haven't created anything yet. Your first AI video takes under two minutes.",
      },
      {
        kind: "list",
        title: "Three ideas to try right now",
        marker: "bullet",
        items: [
          html`<strong>Split-screen video</strong> — paste a script, get a video`,
          html`<strong>Auto Clip</strong> — upload a long video, get viral shorts`,
          html`<strong>AI Voiceover</strong> — turn text into professional narration`,
        ],
      },
      { kind: "button", href: DASHBOARD_URL, label: "Create my first video" },
    ],
  };
}

export function onboardingDay3(p: { name: string; creditsUsed: number; hasUsed: boolean }): EmailDocument {
  const name = greet(p.name);
  if (p.hasUsed) {
    return {
      subject: `${name}, you've already created ${p.creditsUsed} videos — here's what's next`,
      preheader: "A feature you might not have found yet.",
      blocks: [
        { kind: "heading", text: "Great progress" },
        {
          kind: "paragraph",
          text: html`You've already used <strong>${p.creditsUsed} credits</strong> — a strong start. Here's something
            you might not have discovered yet:`,
        },
        {
          kind: "callout",
          tone: "accent",
          title: "Social Tracker",
          body: "Connect YouTube or Instagram and track how your videos perform — views, likes, growth — in one dashboard.",
        },
        { kind: "button", href: DASHBOARD_URL, label: "Go to dashboard" },
      ],
    };
  }

  return {
    subject: `Still haven't tried ${PRODUCT_NAME}? Here's what you're missing`,
    preheader: "Three things creators are making with their free credits.",
    blocks: [
      { kind: "heading", text: "You're missing out" },
      {
        kind: "paragraph",
        text: "You've been signed up for three days but haven't created anything yet. Here's what other creators are making:",
      },
      {
        kind: "list",
        marker: "bullet",
        items: [
          "Viral YouTube Shorts from text scripts",
          "Auto-clipped highlights from long-form videos",
          "AI voiceovers in 50+ voices",
        ],
      },
      { kind: "button", href: DASHBOARD_URL, label: "Go to dashboard" },
    ],
  };
}

export function onboardingDay7(p: { name: string; creditsLeft: number }): EmailDocument {
  return {
    subject: `Keep creating — ${p.creditsLeft} free credits left`,
    preheader: "One week in. Here's what a Pro plan adds when the free credits run out.",
    blocks: [
      { kind: "heading", text: "One week in — keep your momentum" },
      {
        kind: "paragraph",
        text: html`Hi ${greet(p.name)}, you have <strong>${p.creditsLeft} free ${plural(p.creditsLeft, "credit")}</strong>
          left. When they're gone, a Pro plan keeps you creating.`,
      },
      {
        kind: "list",
        title: "With a Pro plan you get",
        marker: "check",
        items: [
          "Monthly credit refills — never run out",
          "All AI tools unlocked",
          "Priority rendering queue",
          "Social Tracker analytics",
        ],
      },
      { kind: "button", href: PRICING_URL, label: "See plans and pricing" },
      { kind: "paragraph", tone: "fine", text: "Plans start from ₹299/month. Cancel any time." },
    ],
  };
}

export function reengagement7Day(p: { name: string; creditsLeft: number }): EmailDocument {
  return {
    subject: `${greet(p.name)}, your ${p.creditsLeft} credits are waiting for you`,
    preheader: "Still here, still yours. Three things to try when you're back.",
    blocks: [
      { kind: "heading", text: `We miss you, ${greet(p.name)}` },
      {
        kind: "paragraph",
        text: html`You haven't created anything in a while. Your <strong>${p.creditsLeft} credits</strong> are still
          here, ready to go.`,
      },
      {
        kind: "list",
        title: "Jump back in and try something new",
        marker: "bullet",
        items: [
          "AI Creator Wizard — describe your idea, get a full video",
          "Voice Changer — transform any voice in seconds",
          "Social Tracker — see how your videos are performing",
        ],
      },
      { kind: "button", href: DASHBOARD_URL, label: "Jump back in" },
    ],
  };
}

export function reengagement30Day(p: {
  name: string;
  creditsLeft: number;
  daysSinceLogin: number;
}): EmailDocument {
  return {
    subject: `We miss you — here's what's new at ${PRODUCT_NAME}`,
    preheader: `It's been ${p.daysSinceLogin} days. A lot has changed since your last visit.`,
    blocks: [
      { kind: "heading", text: "It's been a while — here's what's new" },
      {
        kind: "paragraph",
        text: html`Hi ${greet(p.name)}, it's been ${p.daysSinceLogin} days since you last signed in. A lot has
          improved, and you still have <strong>${p.creditsLeft} credits</strong> waiting.`,
      },
      {
        kind: "list",
        title: `New at ${PRODUCT_NAME}`,
        marker: "bullet",
        items: [
          "Faster rendering engine — 2× speed improvement",
          "50+ new AI voice styles",
          "Instagram and YouTube Social Tracker",
        ],
      },
      { kind: "button", href: DASHBOARD_URL, label: "See what's new" },
      {
        kind: "paragraph",
        tone: "fine",
        text: "Your credits never expire while you're on a paid plan.",
      },
    ],
  };
}

export function firstVideoSuccess(p: { name: string }): EmailDocument {
  return {
    subject: `You just made your first ${PRODUCT_NAME} video — here's what's next`,
    preheader: "Congratulations. Here's what a Pro plan unlocks from here.",
    blocks: [
      { kind: "heading", text: `You just made your first ${PRODUCT_NAME} video` },
      {
        kind: "paragraph",
        text: `Hi ${greet(p.name)}, congratulations on your first AI video. Now that you've seen what's possible, here's what's waiting on Pro:`,
      },
      {
        kind: "list",
        title: "Upgrade to Pro and unlock",
        marker: "check",
        items: [
          html`<strong>Monthly credit refills</strong> — never run out again`,
          html`<strong>Higher resolution exports</strong>`,
          html`<strong>All AI tools</strong> — Voice Changer, Auto Clip, Creator Wizard`,
          html`<strong>Social Tracker</strong> — see how your videos perform`,
          html`<strong>Priority rendering queue</strong>`,
        ],
      },
      { kind: "button", href: PRICING_URL, label: "Explore Pro plans" },
      { kind: "paragraph", tone: "fine", text: "Plans start from ₹299/month. Cancel any time." },
    ],
  };
}
