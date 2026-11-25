import type { BlogPost } from "../types";
import { AUTHORS } from "../authors";
import {
  AUTOCLIP_RERUN_FREE_WINDOW_DAYS,
  FREE_TIER_MONTHLY_BONUS_MINUTES,
  FREE_TIER_SIGNUP_MINUTES,
  PLAN_NAME,
  TIER_MAX_AUTOCLIP_SOURCE_SECONDS,
} from "@/lib/plans/tiers";
import { MAX_CLIPS_PER_RUN } from "@/lib/autoclip-create-input";
import { AUTOCLIP_AI_DEFAULTS } from "@/lib/autoclip-ai/config-shared";
import { SAMPLE_VIDEOS } from "@/lib/sample-projects";

// TikTok's Likeness Detection global rollout and public AI-content checker
// (reported 23 Nov 2026), tied to AutoClip: clips cut from a creator's own
// footage. Every AutoClip figure below is read from the code that enforces it
// (source-length caps, free minutes, clips per run, generated B-roll per clip)
// so the post can't drift from the product. TikTok facts come from the two
// reports linked under the table; TikTok's own newsroom could not be loaded
// when this was written, so nothing here is quoted from it.
//
// Screenshots are real: the read-only podcast demo project on clipiro.com and
// the AutoClip start screen, cropped to leave out the account header. The demo
// footage is CC BY, so the credit renders from lib/sample-projects.ts.

const dir = "/blog/tiktok-ai-likeness-detection";
const hours = (s: number) => s / 3600;
const freeMinutes = TIER_MAX_AUTOCLIP_SOURCE_SECONDS.free / 60;
const maxHours = hours(TIER_MAX_AUTOCLIP_SOURCE_SECONDS.studio);
const brollPerClip = AUTOCLIP_AI_DEFAULTS.broll.maxGeneratedPerClip;
const podcast = SAMPLE_VIDEOS.find((v) => v.id === "podcast")!;
const demoCredit = {
  name: `Demo footage: "${podcast.title}" by ${podcast.creator}, CC BY, cut to 10 minutes and clipped by Clipiro`,
  url: podcast.sourceUrl,
};

export const tiktokAiLikenessDetection: BlogPost = {
  slug: "tiktok-ai-likeness-detection",
  category: "Growth",
  title: "TikTok can now flag AI copies of your face. What creators should do next",
  seoTitle: "TikTok AI likeness detection, explained",
  metaDescription:
    "TikTok's Likeness Detection and AI-content checker, explained for creators: who can use them, what they miss, and how to keep posting footage of the real you.",
  publishedAt: "2026-11-25",
  updatedAt: "2026-11-25",
  author: AUTHORS.founder,
  hero: {
    src: `${dir}/hero.webp`,
    alt: "A Clipiro AutoClip demo project: twelve vertical clips cut from one podcast episode, each with burned-in captions and a score out of 100, sorted best first.",
    width: 1415,
    height: 570,
    credit: demoCredit,
  },
  intro:
    "If people know your face, someone can now make a video of you saying things you never said, in an afternoon, for free. This week TikTok rolled out two tools aimed at that problem. They help, but they don't stop it. The other half of the answer is on your side: post enough real footage of yourself that your audience knows what you actually sound like.",
  body: [
    {
      heading: "What TikTok announced",
      text: "On 23 November 2026, TikTok said its Likeness Detection tool is rolling out globally, and it opened a public checker for AI-generated images and video. Both were reported by Dataconomy and Net Influencer, linked under the table below.",
    },
    {
      lead: "Likeness Detection is for creators.",
      text: "Eligible creators and public figures, political accounts included, verify their identity through a third-party partner. TikTok then flags videos and accounts that may be using their likeness, and the creator can review the matches and report them to TikTok's safety teams. TikTok says it deletes the ID documents after verification. The tool has been in testing with US creators since July.",
    },
    {
      lead: "The checker is for everyone.",
      text: "It sits in TikTok's Transparency Centre and doesn't need an account: you upload an image or a video, and it looks for C2PA Content Credentials and TikTok's own invisible watermark. TikTok also said it has labelled more than 5 billion AI-generated videos, and that a Manage Topics setting will let people choose how much AI content shows up in their For You feed.",
    },
    {
      type: "table",
      caption: "TikTok's two new AI tools, as reported on 23 November 2026",
      columns: ["", "Likeness Detection", "AI content checker"],
      rows: [
        ["Who it's for", "Eligible creators and public figures, including political accounts", "Anyone, with or without a TikTok account"],
        ["How you use it", "Verify your identity with a third-party partner, then review flagged matches", "Upload an image or video in TikTok's Transparency Centre"],
        ["What it looks for", "Videos and accounts on TikTok that may use your likeness", "C2PA Content Credentials and TikTok's invisible watermark"],
        ["What you can do with it", "Review matches and report them to TikTok's safety teams", "See whether a file carries those signals"],
        ["Main limit", "Only eligible accounts can enrol; TikTok hasn't published accuracy figures", "Only detects content made or edited with TikTok's own AI tools"],
      ],
      sources: [
        { label: "Dataconomy, 23 Nov 2026", href: "https://dataconomy.com/2026/11/23/tiktok-rolls-out-deepfake-likeness-detection-tool-worldwide/" },
        {
          label: "Net Influencer, 23 Nov 2026",
          href: "https://www.netinfluencer.com/tiktok-launches-public-ai-content-checker-begins-global-rollout-of-likeness-detection/",
        },
      ],
    },
    {
      heading: "Why it matters, and where it stops",
      text: "Detection helps after a fake already exists: it can find a copy and help you get it reported. It doesn't stop the copy being made, and it covers less than the headlines suggest. The checker only recognises content made with TikTok's own AI tools. Content Credentials can be lost when a file is downloaded or re-edited, and they only help if the platform reading them looks for them. So a clean result from the checker doesn't prove a video is real.",
    },
    {
      lead: "Your audience is the other detector.",
      text: "A viewer who has watched you for months notices when a voice is a little off, or when \"you\" suddenly say something you never would. That only works if they've seen plenty of the real thing. A creator who posts once a fortnight leaves gaps for an impersonator to fill. A creator who posts real clips every day doesn't.",
    },
    {
      lead: "Most of that footage already exists.",
      text: "If you make long videos, such as podcasts, streams, interviews or talks, you've already filmed hours of yourself talking. The work is turning those hours into short clips often enough to stay visible. That's what AutoClip is for.",
    },
    {
      heading: "How to turn your own footage into clips with AutoClip",
      text: "AutoClip takes one long video and gives you a set of short vertical clips cut from it. Everything on screen is footage you filmed: your face, your voice, your words. Here's the workflow.",
    },
    {
      lead: "1. Add the long video.",
      text: `Upload an MP4, MOV or WebM file, pick one from your Assets, or paste a link from YouTube, Twitch, Vimeo, Loom, Google Drive or Dropbox. Each plan caps how long a source can be: ${freeMinutes} minutes on ${PLAN_NAME.free}, ${hours(TIER_MAX_AUTOCLIP_SOURCE_SECONDS.creator)} hours on ${PLAN_NAME.creator}, ${hours(TIER_MAX_AUTOCLIP_SOURCE_SECONDS.pro)} on ${PLAN_NAME.pro} and ${maxHours} on ${PLAN_NAME.studio}.`,
    },
    {
      type: "image",
      image: {
        src: `${dir}/step-1-upload.webp`,
        alt: "The AutoClip start screen asking \"What are we clipping today?\", with a drop zone for MP4, MOV or WebM files, a Choose from Assets button, and a field to paste a YouTube, Twitch, Vimeo, Loom, Google Drive or Dropbox link.",
        width: 970,
        height: 490,
        caption: "Step 1: drop in a file or paste a link. The size and length limits shown depend on your plan.",
      },
    },
    {
      lead: "2. Say what you want.",
      text: `Tell AutoClip what kind of video it is and it sets things up for you. You can still choose how many clips you want (up to ${MAX_CLIPS_PER_RUN} per run), how long they should be, and the aspect ratio: 9:16 for TikTok, Reels and Shorts. AutoClip transcribes the video, finds the moments that work on their own, reframes them to vertical, and adds captions.`,
    },
    {
      lead: "3. Review the clips, best first.",
      text: "Each clip gets a score out of 100, with letter grades for hook, flow, value and trend, plus a short note on why it works and the full transcript. Watch the top few before you post anything. You're the one who knows whether a line lands out of context.",
    },
    {
      type: "image",
      image: {
        src: `${dir}/step-3-clip-detail.webp`,
        alt: "One AutoClip clip open for review: a vertical preview with captions, a score of 88 out of 100 with A grades for Hook, Flow, Value and Trend, the clip's title, timestamp, why it works and transcript, and buttons to publish, download, export XML, edit, duplicate or add to a collection.",
        width: 908,
        height: 390,
        caption: "Step 3: every clip shows its score, why it works and its transcript before you post it.",
        credit: demoCredit,
      },
    },
    {
      lead: "4. Post it.",
      text: "Download the clip and upload it to TikTok yourself; Clipiro doesn't post to TikTok directly. For YouTube Shorts you can publish or schedule straight from the clip once your channel is connected. Instagram and Facebook posts can be planned in Clipiro and posted by you.",
    },
    {
      type: "callout",
      tone: "tip",
      title: "Know which parts of a clip are AI",
      text: `AutoClip can add up to ${brollPerClip} short cutaway images per clip, and those images are AI-generated. They're drawn to illustrate what you're saying, and the prompt rules out human faces and text, so the only person on screen is you. If a platform asks whether a post contains realistic AI-generated visuals, answer honestly and check its current labelling rules.`,
    },
    {
      heading: "Three habits that make impersonation harder",
      text: "Keep your originals. The raw files and links to your full episodes are the simplest proof of what you actually said if you ever need to report a fake.",
    },
    {
      lead: "Post often.",
      text: "One long episode a week can become a clip a day. Our posting cadence guide covers how to space them so they don't compete with each other.",
    },
    {
      lead: "Point back to the full video.",
      text: "A clip that links to the full episode gives viewers a way to check the context for themselves, which is exactly what a fake can't offer.",
    },
    {
      type: "callout",
      tone: "stat",
      text: `What it costs: AutoClip uses one Clip Minute per minute of source video, rounded up per video, however many clips it finds. A new account starts with ${FREE_TIER_SIGNUP_MINUTES} free minutes and gets ${FREE_TIER_MONTHLY_BONUS_MINUTES} more each month, with watermarked clips. Re-running the same video within ${AUTOCLIP_RERUN_FREE_WINDOW_DAYS} days is free.`,
    },
    {
      type: "cta",
      heading: "Turn your last long video into a week of clips",
      body: "Paste a link or upload a file. AutoClip finds the moments, reframes them to vertical and captions them.",
      label: "Try AutoClip free",
      href: "/register",
    },
  ],
  faqs: [
    {
      question: "What is TikTok Likeness Detection?",
      answer:
        "It's an opt-in TikTok tool for eligible creators and public figures. You verify your identity through a third-party partner, and TikTok then flags videos and accounts that may be using your likeness, so you can review them and report them to its safety teams. It started testing with US creators in July 2026 and began rolling out globally in November 2026.",
    },
    {
      question: "Can TikTok's AI content checker tell if any video is AI-generated?",
      answer:
        "No. It looks for C2PA Content Credentials and TikTok's invisible watermark, so it only recognises content made or edited with TikTok's own AI tools. Credentials can be lost when a file is downloaded or edited, so a clean result doesn't prove a video is real.",
    },
    {
      question: "Does Clipiro AutoClip make AI-generated videos of me?",
      answer: `No. AutoClip cuts clips from the video you upload, so your face and voice come from your own footage. It can add up to ${brollPerClip} short AI-generated cutaway images per clip, drawn without human faces or text.`,
    },
    {
      question: "Can Clipiro post clips to TikTok automatically?",
      answer:
        "Not today. Download the clip and upload it in the TikTok app. Clipiro can publish and schedule YouTube Shorts directly, and Instagram and Facebook posts can be planned in Clipiro and posted by you.",
    },
  ],
  closing:
    "TikTok's new tools are a real step forward, but they work after the fact and only partly. The best protection you control is a steady stream of real footage of you, so your audience knows the original when they see a fake. If you already have long videos, you already have that footage. Clip it, post it, and keep posting.",
};
