// Welcome, onboarding drip, re-engagement and the first-clips upsell.
// All opt-out-able marketing/product mail.
//
// Rewritten 2026-11-19 around what the product actually is now: AutoClip,
// billed in Clip Minutes. The previous copy still pitched "AI videos from text
// scripts", Voice Changer and a "Creator Wizard" (all deleted 2026-09) and
// counted everything in credits, which AutoClip doesn't spend.

import type { EmailDocument } from "../layout";
import { html } from "../html";
import { formatDateShort, greet, plural } from "../format";
import { APP_URL, PRODUCT_NAME } from "../tokens";
import { TRIAL_DAYS, TRIAL_MINUTES } from "@/lib/plans/tiers";

const DASHBOARD_URL = `${APP_URL}/dashboard`;
// The in-app plans view (BillingOverlayContext PLANS_HREF), not the marketing
// /pricing page: a signed-in user lands on the same plans + trial screen the
// app's own Upgrade buttons open, already logged in.
const PLANS_URL = `${APP_URL}/dashboard?billing=1&view=plans`;
/** Straight to the Pro trial's "₹0 due today" checkout, tagged with the email
 *  it came from (BillingOverlayContext reads intent= and src=). */
const trialUrl = (template: string) => `${APP_URL}/dashboard?billing=1&view=plans&intent=trial&src=email_${template}`;

/** The three steps every "you haven't started yet" email repeats. */
const HOW_IT_WORKS = [
  "Paste a YouTube or Twitch link, or upload a video",
  "AutoClip finds the best moments and captions them",
  "Download vertical clips for Shorts, Reels and TikTok",
];

const FREE_LIMITS = "Free clips carry a small watermark and export at 720p.";

export function welcome(p: { firstName: string; minutes: number }): EmailDocument {
  const name = greet(p.firstName);
  return {
    subject: `Welcome to ${PRODUCT_NAME}, ${name} — ${p.minutes} free Clip Minutes are ready`,
    preheader: "Paste a link to a long video and get your first clips in a few minutes.",
    blocks: [
      { kind: "heading", text: `Welcome to ${PRODUCT_NAME}, ${name}` },
      {
        kind: "paragraph",
        text: "Give AutoClip one long video (a stream, podcast or talk) and it gives you back short vertical clips with captions.",
      },
      {
        kind: "hero",
        label: "Free Clip Minutes",
        value: String(p.minutes),
        caption: "one minute of source video each",
        tone: "brand",
      },
      { kind: "list", title: "Your first clips in three steps", marker: "number", items: HOW_IT_WORKS },
      { kind: "button", href: DASHBOARD_URL, label: "Make my first clips" },
      {
        kind: "paragraph",
        tone: "fine",
        text: "Tip: start with a video under 10 minutes, or a link to one. It's quick to process and leaves you minutes for a second try.",
      },
    ],
  };
}

/** What to paste, in the words of what the user said they make (welcome
 *  screen → User.intendedUse). */
export function sourceExample(intendedUse: string | null | undefined): string {
  switch (intendedUse) {
    case "gaming": return "a Twitch VOD or YouTube stream";
    case "podcast": return "a podcast episode on YouTube";
    case "education": return "a recorded talk or lesson";
    case "business_marketing": return "a webinar, demo or interview";
    default: return "any long video";
  }
}

export function firstRunNudge(p: { name: string; minutesLeft: number; intendedUse: string | null }): EmailDocument {
  const example = sourceExample(p.intendedUse);
  return {
    subject: `Your first clips take one link`,
    preheader: `Paste ${example} and AutoClip does the rest.`,
    blocks: [
      { kind: "heading", text: `Ready when you are, ${greet(p.name)}` },
      {
        kind: "paragraph",
        text: html`Paste ${example} into the box on your Home page and AutoClip finds the best moments, captions
          them and cuts them vertical. You have <strong>${p.minutesLeft} free Clip ${plural(p.minutesLeft, "Minute")}</strong>.`,
      },
      { kind: "button", href: DASHBOARD_URL, label: "Paste a link" },
      {
        kind: "paragraph",
        tone: "fine",
        text: "Tip: a video under 10 minutes is quick to process and leaves you minutes for a second try. Short on time? Open a demo project on Home to see what comes back.",
      },
    ],
  };
}

export function onboardingDay1(p: { name: string; minutesLeft: number }): EmailDocument {
  return {
    subject: `Your ${p.minutesLeft} free Clip Minutes are still waiting`,
    preheader: "Paste one link. That's the whole setup.",
    blocks: [
      { kind: "heading", text: `Your first clips are one link away, ${greet(p.name)}` },
      {
        kind: "paragraph",
        text: html`You signed up yesterday but haven't run AutoClip yet. You have
          <strong>${p.minutesLeft} free Clip ${plural(p.minutesLeft, "Minute")}</strong>, enough for a full stream highlight or podcast episode.`,
      },
      { kind: "list", title: "How it works", marker: "number", items: HOW_IT_WORKS },
      { kind: "button", href: DASHBOARD_URL, label: "Paste a link" },
    ],
  };
}

export function onboardingDay3(p: { name: string; clipCount: number; hasUsed: boolean }): EmailDocument {
  const name = greet(p.name);
  if (p.hasUsed) {
    return {
      subject: `${name}, you've made ${p.clipCount} ${plural(p.clipCount, "clip")} — make them look like yours`,
      preheader: "Caption styles, your own brand, and the clip editor.",
      blocks: [
        { kind: "heading", text: "Nice start" },
        {
          kind: "paragraph",
          text: html`AutoClip has made you <strong>${p.clipCount} ${plural(p.clipCount, "clip")}</strong>. Three things
            worth trying on them:`,
        },
        {
          kind: "list",
          marker: "bullet",
          items: [
            html`<strong>Caption styles</strong> — 150 looks, from clean to gaming`,
            html`<strong>Trim and reframe</strong> — open any clip and adjust the start, end or crop`,
            html`<strong>Run another video</strong> — re-running the same video is free for a while`,
          ],
        },
        { kind: "button", href: DASHBOARD_URL, label: "Open my clips" },
      ],
    };
  }

  return {
    subject: `Still haven't tried AutoClip? It takes one link`,
    preheader: "Streams, podcasts, talks — anything long becomes Shorts.",
    blocks: [
      { kind: "heading", text: "Your free minutes are still here" },
      {
        kind: "paragraph",
        text: "Creators use AutoClip to turn one long video into a week of Shorts, Reels and TikToks:",
      },
      {
        kind: "list",
        marker: "bullet",
        items: [
          "Stream VODs into highlight clips",
          "Podcast episodes into talking-point clips",
          "Talks and lessons into bite-size explainers",
        ],
      },
      { kind: "button", href: DASHBOARD_URL, label: "Make my first clips" },
    ],
  };
}

export function onboardingDay7(p: { name: string; minutesLeft: number }): EmailDocument {
  return {
    subject: `One week in — clips without the watermark`,
    preheader: `Try Pro free for ${TRIAL_DAYS} days: no watermark, 1080p, more minutes.`,
    blocks: [
      { kind: "heading", text: "Ready to post clips that look fully yours?" },
      {
        kind: "paragraph",
        text: html`Hi ${greet(p.name)}, you have <strong>${p.minutesLeft} free Clip ${plural(p.minutesLeft, "Minute")}</strong>
          left. ${FREE_LIMITS}`,
      },
      {
        kind: "list",
        title: "Every paid plan gives you",
        marker: "check",
        items: [
          "No watermark on any clip",
          "1080p exports (4K on Pro)",
          "Clip Minutes every month, for longer videos",
        ],
      },
      { kind: "button", href: PLANS_URL, label: `Try Pro free for ${TRIAL_DAYS} days` },
      { kind: "paragraph", tone: "fine", text: "Cancel any time during the trial and you won't be charged." },
    ],
  };
}

export function reengagement7Day(p: { name: string; minutesLeft: number }): EmailDocument {
  return {
    subject: `${greet(p.name)}, your ${p.minutesLeft} Clip Minutes are waiting`,
    preheader: "Got a new stream or episode? Turn it into clips.",
    blocks: [
      { kind: "heading", text: `Got a new video, ${greet(p.name)}?` },
      {
        kind: "paragraph",
        text: html`Your <strong>${p.minutesLeft} Clip ${plural(p.minutesLeft, "Minute")}</strong> are still here. Paste the
          link to your latest stream, podcast or talk and AutoClip will cut it into Shorts.`,
      },
      { kind: "button", href: DASHBOARD_URL, label: "Paste a link" },
    ],
  };
}

export function reengagement30Day(p: {
  name: string;
  minutesLeft: number;
  daysSinceLogin: number;
}): EmailDocument {
  return {
    subject: `What's new at ${PRODUCT_NAME}`,
    preheader: `It's been ${p.daysSinceLogin} days. AutoClip has improved a lot since then.`,
    blocks: [
      { kind: "heading", text: "It's been a while — here's what's new" },
      {
        kind: "paragraph",
        text: html`Hi ${greet(p.name)}, it's been ${p.daysSinceLogin} days since you last signed in, and you have
          <strong>${p.minutesLeft} Clip ${plural(p.minutesLeft, "Minute")}</strong> to use.`,
      },
      {
        kind: "list",
        title: `New at ${PRODUCT_NAME}`,
        marker: "bullet",
        items: [
          "Paste a Twitch or YouTube link instead of uploading",
          "150 caption styles, including gaming looks",
          "Edit any clip's captions and timing in one click",
        ],
      },
      { kind: "button", href: DASHBOARD_URL, label: "Try it on a new video" },
    ],
  };
}

export function firstVideoSuccess(p: { name: string; clipCount: number }): EmailDocument {
  return {
    subject: `Your first ${plural(p.clipCount, "clip")} — now without the watermark?`,
    preheader: `Try Pro free for ${TRIAL_DAYS} days: no watermark, 1080p and 4K, more Clip Minutes.`,
    blocks: [
      { kind: "heading", text: `You made your first ${p.clipCount} ${plural(p.clipCount, "clip")}` },
      {
        kind: "paragraph",
        text: html`Hi ${greet(p.name)}, nice work. ${FREE_LIMITS} Before you post them, here's what Pro changes:`,
      },
      {
        kind: "list",
        title: `Pro, free for ${TRIAL_DAYS} days`,
        marker: "check",
        items: [
          html`<strong>No watermark</strong> on every clip`,
          html`<strong>1080p and 4K</strong> exports`,
          html`<strong>More Clip Minutes</strong> every month, for full streams and episodes`,
        ],
      },
      { kind: "button", href: PLANS_URL, label: `Start my ${TRIAL_DAYS}-day free trial` },
      { kind: "paragraph", tone: "fine", text: "Cancel any time during the trial and you won't be charged." },
    ],
  };
}

/**
 * Free Clip Minutes about to expire (conversion plan, 2026-11-26): 900 free
 * minutes had expired unused, silently. Sent ~3 days before
 * bonusMinutesExpireAt (app/api/cron/onboarding), once per expiry.
 */
export function minutesExpiring(p: {
  name: string;
  minutesLeft: number;
  expiresAt: Date;
  trialEligible: boolean;
}): EmailDocument {
  const when = formatDateShort(p.expiresAt);
  return {
    subject: `Your ${p.minutesLeft} free Clip ${plural(p.minutesLeft, "Minute")} expire on ${when}`,
    preheader: "Turn a stream or podcast into clips before they go.",
    blocks: [
      { kind: "heading", text: `Use them before ${when}, ${greet(p.name)}` },
      {
        kind: "paragraph",
        text: html`You have <strong>${p.minutesLeft} free Clip ${plural(p.minutesLeft, "Minute")}</strong> that expire on
          <strong>${when}</strong>. That's enough to clip ${p.minutesLeft} minutes of video: paste a YouTube or Twitch link
          and AutoClip does the rest.`,
      },
      { kind: "hero", label: "Free Clip Minutes left", value: String(p.minutesLeft), caption: `expire ${when}`, tone: "warning" },
      { kind: "button", href: DASHBOARD_URL, label: "Make clips now" },
      p.trialEligible
        ? {
            kind: "paragraph",
            tone: "fine",
            text: html`Need more? A ${TRIAL_DAYS}-day Pro trial adds ${TRIAL_MINUTES} minutes with no watermark, ₹0 today.
              <a href="${trialUrl("minutes_expiring")}">Start the trial</a>.`,
          }
        : { kind: "paragraph", tone: "fine", text: FREE_LIMITS },
    ],
  };
}
