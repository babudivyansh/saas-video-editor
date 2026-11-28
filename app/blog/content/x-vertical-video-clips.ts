import type { BlogPost } from "../types";
import { AUTHORS } from "../authors";
import { AUTOCLIP_RERUN_FREE_WINDOW_DAYS, FREE_TIER_MONTHLY_BONUS_MINUTES, FREE_TIER_SIGNUP_MINUTES } from "@/lib/plans/tiers";
import { PACK_NO_WATERMARK_DAYS } from "@/lib/conversion";
import { SAMPLE_VIDEOS } from "@/lib/sample-projects";

// X's 25 Nov 2026 vertical-video update (upgraded Media Editor, React with
// Video, Live Studio beta, the invite-only Video Kickstart Bonus), as reported
// by Tubefilter. X's own posts couldn't be fetched (x.com answers automated
// requests with 402), so every X fact here rests on Tubefilter and is worded
// as "X says" / "according to".
//
// Clipiro facts are from the code: the clip-length presets in
// app/dashboard/create/auto-clip/page.tsx top out at 120 s ("60s+" is 60–120),
// so every clip AutoClip's UI makes is under X's three-minute bonus line;
// lib/clip-watermark.ts decides the watermark (paid plans never; free plan yes
// unless the run used purchased minutes or a pack was bought in the last
// PACK_NO_WATERMARK_DAYS days); lib/social/publish.ts has no X posting, so the
// post says to download and upload.
//
// Screenshots: the real AutoClip setup on clipiro.com with the CC BY sample
// podcast from Assets, stopped before Generate; the account's balance line is
// blurred.

const dir = "/blog/x-vertical-video-clips";
const podcast = SAMPLE_VIDEOS.find((v) => v.id === "podcast")!;
const podcastCredit = {
  name: `Sample video: "${podcast.title}" by ${podcast.creator}, CC BY`,
  url: podcast.sourceUrl,
};

export const xVerticalVideoClips: BlogPost = {
  slug: "x-vertical-video-clips",
  category: "Growth",
  title: "X is betting on vertical video. Here's how to make clips that fit",
  seoTitle: "X vertical video: what creators should post",
  metaDescription:
    "X's new video tools and Video Kickstart Bonus favour original vertical clips under 3 minutes with no watermark. How to make them from your long videos.",
  publishedAt: "2026-11-28",
  updatedAt: "2026-11-28",
  author: AUTHORS.founder,
  hero: {
    src: `${dir}/hero.webp`,
    alt: "AutoClip's \"How should it look?\" step: clip length set to 15 to 60 seconds, 8 clips, 9:16 aspect ratio, Smart layout that cuts between speakers, and burned-in word-by-word captions with style families to pick from.",
    width: 636,
    height: 555,
  },
  intro:
    "X wants more video, and this week it said so with new tools and new money. According to Tubefilter, X is now testing a bonus for original vertical videos under three minutes, posted without a watermark. If you already make long videos, that's a format you can produce from footage you have. The problem is the hours it takes to cut them by hand.",
  body: [
    {
      heading: "What X announced",
      text: "On 25 November, Tubefilter reported a set of creator updates from X aimed at vertical video. X's pitch is that creators should be able to make polished vertical video without leaving the app.",
    },
    {
      lead: "New tools.",
      text: "An upgraded Media Editor lets you record in segments, turn horizontal video into vertical, generate captions, trim, and add text and a custom thumbnail. React with Video lets you reply to a post with your own video side by side with it. Live Studio, in beta, is a control room for scheduling and running livestreams, with chat controls and analytics.",
    },
    {
      lead: "New money.",
      text: "Video Kickstart Bonus is an invite-only pilot that pays a bonus for original vertical videos under three minutes, with no watermarks. It sits alongside Original Content Rewards, which replaced X's revenue sharing earlier this autumn. Earlier in November, X also launched Clipping, which lets people clip moments from videos on X and post them with commentary, crediting and linking the original.",
    },
    {
      lead: "The reason.",
      text: "X said on 20 November that video is its fastest-growing format, that posts with video get five times the reach and engagement, and that 36% of all impressions now go to video. Those are X's own figures.",
    },
    {
      type: "table",
      caption: "X's November 2026 video updates and what each means for your clips, as reported by Tubefilter",
      columns: ["Update", "What it does", "What it means for clips"],
      rows: [
        ["Upgraded Media Editor", "Record in segments, convert horizontal to vertical, captions, trim, text, custom thumbnails", "Fine for quick edits in the app; you still pick the moments yourself"],
        ["React with Video", "Reply to a post with your video side by side", "A reason to keep short reaction-ready clips of your takes"],
        ["Live Studio (beta)", "Schedule streams, manage chat, see live and post-stream analytics", "Streams become long source footage you can clip later"],
        ["Video Kickstart Bonus (invite-only pilot)", "Bonus for original vertical video under 3 minutes, no watermarks", "Clips must be yours, vertical, short and clean"],
        ["Clipping", "Clip moments from videos on X and post with commentary", "Others can clip you, with credit back to your original"],
      ],
      sources: [
        { label: "Tubefilter, 25 Nov 2026", href: "https://www.tubefilter.com/2026/11/25/x-doubles-down-on-short-form-vertical-video/" },
      ],
    },
    {
      heading: "Why it matters for creators",
      text: "Every platform now wants the same thing: short vertical video that started with you. YouTube has Shorts, Instagram has Reels, Facebook pays for Reels, and now X is paying for vertical clips too. The format is the same everywhere, so one batch of clips can serve all of them.",
    },
    {
      lead: "Under three minutes, original, and clean.",
      text: "Those three conditions in X's pilot are worth treating as the default anyway. Short clips get finished. Original clips are the ones platforms reward. A clip with another app's watermark tells the algorithm, and the viewer, that it was made for somewhere else.",
    },
    {
      lead: "The slow part isn't editing, it's finding.",
      text: "X's editor can trim and caption a clip, but it can't watch your hour-long podcast and tell you which 40 seconds will hold someone's attention. That's the part that takes an afternoon.",
    },
    {
      heading: "How to make X-ready clips with AutoClip",
      text: "AutoClip does the finding: it reads the whole video, picks the moments that stand on their own, and cuts them as vertical clips with captions. Here's the setup, start to finish.",
    },
    {
      lead: "1. Add the video and say what it is.",
      text: "Upload a file, pick one from your Assets, or paste a link. Then choose what kind of video it is: podcast or interview, talking head or tutorial, gaming stream, vlog or travel, or something else. Each choice sets sensible defaults, such as 8 clips of 15–60 seconds that follow whoever is talking for a podcast.",
    },
    {
      type: "image",
      image: {
        src: `${dir}/step-1-video-type.webp`,
        alt: "AutoClip's first question, \"What are we clipping today?\", with a sample podcast picked from Assets and five video types to choose from: Podcast or interview (selected, 8 clips, 15 to 60 seconds), Talking head or tutorial, Gaming stream, Vlog or travel, and Something else.",
        width: 890,
        height: 475,
        caption: "Step 1: pick the video, then what kind of video it is.",
        credit: podcastCredit,
      },
    },
    {
      lead: "2. Set the length and shape.",
      text: "Clip length comes in three bands: under 30 seconds, 15–60 seconds, and 60 seconds or more, which tops out at two minutes. So every clip lands under X's three-minute line. Choose 9:16 for vertical, then a layout: Smart cuts between speakers, Split screen stacks two speakers, and Full frame keeps the whole shot over a blurred fill. Leave captions on and pick a style.",
    },
    {
      lead: "3. Check the cost and generate.",
      text: `The review step shows how many Clip Minutes the run uses: one per minute of video, however many clips come out. Re-running the same video within ${AUTOCLIP_RERUN_FREE_WINDOW_DAYS} days is free, and a failed run is refunded.`,
    },
    {
      type: "image",
      image: {
        src: `${dir}/step-3-review.webp`,
        alt: "AutoClip's review step, \"Ready to clip?\": the sample podcast, a summary of 8 clips at 15 to 60 seconds in 9:16 with captions on, an Advanced section for reframe, camera motion, zoom, audio cleanup and instructions, and a note that the run uses 10 Clip Minutes.",
        width: 646,
        height: 460,
        caption: "Step 3: the review shows the Clip Minutes a run will use before anything starts. The account balance is blurred.",
        credit: podcastCredit,
      },
    },
    {
      lead: "4. Download and post to X.",
      text: "Review the clips, keep the best, and download them. Clipiro doesn't post to X directly, so upload them in the X app or on x.com like any other video, and write the post in your own words.",
    },
    {
      type: "callout",
      tone: "warning",
      title: "Watermarks on the free plan",
      text: `Clips made on the free plan carry a small Clipiro watermark, which would rule them out of a no-watermark bonus like X's. Paid plans never add one. A free account's clips are also watermark-free when the run uses minutes from a pack you bought, or when you've bought a pack in the last ${PACK_NO_WATERMARK_DAYS} days.`,
    },
    {
      type: "callout",
      tone: "tip",
      title: "Clip your streams too",
      text: "If you go live with Live Studio, or anywhere else, the recording is a long video like any other. Paste the link into AutoClip after the stream ends and you've got next week's clips.",
    },
    {
      type: "cta",
      heading: "Turn your next long video into X-ready clips",
      body: `Start free with ${FREE_TIER_SIGNUP_MINUTES} Clip Minutes, plus ${FREE_TIER_MONTHLY_BONUS_MINUTES} more each month.`,
      label: "Try AutoClip free",
      href: "/register",
    },
  ],
  faqs: [
    {
      question: "What is X's Video Kickstart Bonus?",
      answer:
        "According to Tubefilter, it's an invite-only pilot from X that pays creators a bonus for original vertical videos under three minutes, posted without watermarks. It runs alongside X's Original Content Rewards programme.",
    },
    {
      question: "How long can a video on X be?",
      answer:
        "It depends on your account: X raised the limit to 60 minutes for paying subscribers in December 2022, according to Tubefilter. For the Video Kickstart Bonus, though, the video has to be under three minutes.",
    },
    {
      question: "Can X turn a horizontal video into a vertical one?",
      answer:
        "X's upgraded Media Editor can convert horizontal video to vertical, according to Tubefilter. Tools like Clipiro's AutoClip go further: they choose the moments worth clipping and reframe each one to follow whoever is speaking.",
    },
    {
      question: "Does Clipiro post clips to X?",
      answer:
        "Not directly. Download your clips from Clipiro and upload them on X. Clipiro can post and schedule to YouTube automatically.",
    },
  ],
  closing:
    "X joining the vertical video race doesn't mean making a new kind of content. It means the clips you'd make for Shorts and Reels have one more place to go, and one more programme that pays for them. Keep them short, keep them yours, and keep them clean.",
};
