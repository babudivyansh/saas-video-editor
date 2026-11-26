import type { BlogPost } from "../types";
import { AUTHORS } from "../authors";
import { FREE_TIER_MONTHLY_BONUS_MINUTES, FREE_TIER_SIGNUP_MINUTES } from "@/lib/plans/tiers";
import { MAX_CLIPS_PER_RUN } from "@/lib/autoclip-create-input";
import { SAMPLE_VIDEOS } from "@/lib/sample-projects";

// Facebook's Creator Fast Track (launched March 2026; College Edition added in
// a 13 Nov 2026 update, reported by Tubefilter on 23 Nov), tied to AutoClip +
// the Social Tracker composer: the programme pays for a steady run of Reels,
// and the hard part is keeping up.
//
// Programme facts come from Meta's newsroom post, Meta's programme page and
// Tubefilter, linked under the table. Meta's sources disagree on pay amounts
// (the programme page served in India lists far lower figures than the US
// newsroom post), so the post gives the newsroom figures as US figures and
// tells readers to check the page for their country rather than picking one.
//
// Clipiro facts are from the code: lib/social/publish.ts (only YouTube posts
// automatically; Instagram and Facebook posts become "your turn" reminders),
// app/dashboard/social-tracker/components/Composer.tsx (the four steps, Draft
// with AI, Best time) and lib/social/posts-web.ts (best slots need two or more
// past posts in a slot). Screenshots are the real composer on clipiro.com with
// the CC BY sample vlog's clips; the connected-account step is cropped out and
// the account's engagement figures are blurred.

const dir = "/blog/facebook-creator-fast-track";
const vlog = SAMPLE_VIDEOS.find((v) => v.id === "vlog")!;
const vlogCredit = {
  name: `Clips from "${vlog.title}" by ${vlog.creator}, CC BY, cut to 10 minutes and clipped by Clipiro`,
  url: vlog.sourceUrl,
};

export const facebookCreatorFastTrack: BlogPost = {
  slug: "facebook-creator-fast-track",
  category: "Growth",
  title: "Facebook will pay you to post Reels. Here's how to keep up with Creator Fast Track",
  seoTitle: "Facebook Creator Fast Track, explained",
  metaDescription:
    "Facebook's Creator Fast Track pays creators to post Reels, now including US college students. What it asks for, and how to keep up without filming every day.",
  publishedAt: "2026-11-26",
  updatedAt: "2026-11-26",
  author: AUTHORS.founder,
  hero: {
    src: `${dir}/hero.webp`,
    alt: "Clipiro's New post composer, step 1: a grid of short vertical clips cut from one travel vlog, each with its title and length, ready to pick for a scheduled post.",
    width: 646,
    height: 476,
    credit: vlogCredit,
  },
  intro:
    "Facebook is paying creators to post Reels, and this month it opened the offer to US college students with as few as 1,000 followers elsewhere. The money is real. The catch is consistency: the programme pays for a steady run of Reels, every month, for three months. If you film long videos, you already have the footage. The hard part is turning it into a Reel almost every day without it eating your week.",
  body: [
    {
      heading: "What Facebook announced",
      text: "Creator Fast Track launched in March 2026 for creators who are established on other platforms but new to Facebook. Meta says it gives them guaranteed monthly payments for three months for sharing eligible Reels, plus extra reach while they build an audience.",
    },
    {
      lead: "College Edition is the new part.",
      text: "In a 13 November update, Meta added a College Edition for US-based college creators with at least 1,000 followers on Instagram, TikTok or YouTube, who apply with a .edu email address. They get increased reach on eligible Reels and immediate access to Facebook's Content Monetization programme. Tubefilter reported the expansion on 23 November.",
    },
    {
      lead: "The money.",
      text: "In its US announcement, Meta lists $1,000 a month for creators with 100,000+ followers elsewhere and $3,000 a month for 1 million+. It also says Facebook paid creators nearly $3 billion in 2025, up 35% on the year before, with 60% of that going to Reels.",
    },
    {
      type: "table",
      caption: "Creator Fast Track as Meta describes it, November 2026",
      columns: ["", "Creator Fast Track", "College Edition"],
      rows: [
        ["Who it's for", "Creators established elsewhere but new to Facebook", "US college creators with a .edu email"],
        ["Follower minimum", "20,000 on Instagram, TikTok or YouTube (programme page)", "1,000 on Instagram, TikTok or YouTube"],
        ["What you get", "Guaranteed monthly pay for 3 months, plus extra reach", "Extra reach on eligible Reels and immediate Content Monetization access"],
        ["Pay (US announcement)", "$1,000 a month at 100,000+ followers, $3,000 at 1M+", "Bonus pay for larger accounts"],
        ["Posting (programme page)", "20 qualifying Reels a month, on 20 different days", "Not stated separately"],
        ["Content", "Your own original work, not posted on Facebook before", "Subject to the programme's terms"],
      ],
      sources: [
        { label: "Meta newsroom: Creator Fast Track (updated 13 Nov 2026)", href: "https://about.fb.com/news/2026/03/creator-fast-track-grow-your-audience-earn-money-on-facebook/" },
        { label: "Meta: Creator Fast Track programme page", href: "https://creators.facebook.com/creator-fast-track" },
        { label: "Tubefilter, 23 Nov 2026", href: "https://www.tubefilter.com/2026/11/23/facebook-paying-college-creators-to-post-reels/" },
      ],
    },
    {
      type: "callout",
      tone: "warning",
      title: "Check the page for your country",
      text: "Meta's own pages don't agree on the numbers. The programme page as served in India lists much lower monthly payments than the US announcement, and it's the only source that spells out the 20-Reels rule. Read the version for your region before you plan around a figure.",
    },
    {
      heading: "Why it matters for creators",
      text: "Fast Track doesn't reward one great Reel. Going by Meta's programme page, it rewards 20 of them a month, each posted on a different day, every month for three months. That's the part most creators fail at, and it has nothing to do with talent. It's time.",
    },
    {
      lead: "Twenty Reels is a production schedule.",
      text: "If each Reel takes an hour to find, cut, caption and post, that's 20 hours a month on top of making your main content. Most people manage two weeks of that, then miss a few days, and the month no longer qualifies.",
    },
    {
      lead: "You probably have the footage already.",
      text: "The programme page says content can be made before you join, as long as it's your own and hasn't been posted on Facebook. A podcast, a stream or a YouTube video you filmed is exactly that kind of raw material. One hour-long video often holds more than 20 moments that stand on their own.",
    },
    {
      heading: "How to plan a month of Reels with Clipiro",
      text: "The workflow has two halves: cut a month of clips in one sitting, then spread them across the month so each one has its own day.",
    },
    {
      lead: "1. Cut the clips with AutoClip.",
      text: `Upload a long video or paste a YouTube, Twitch, Vimeo, Loom, Google Drive or Dropbox link, and ask for up to ${MAX_CLIPS_PER_RUN} clips in 9:16. AutoClip finds the moments that work on their own, reframes them to vertical and captions them. Two long videos can cover a month.`,
    },
    {
      lead: "2. Open a new post in Social Tracker.",
      text: "The composer starts with your clips: pick one, or switch to Assets for any other video in your library.",
    },
    {
      lead: "3. Write the caption, or draft it with AI.",
      text: "Add a caption and hashtags yourself, or press Draft with AI to get a starting point. Drafting costs AI credits, and the composer tells you how many before it runs.",
    },
    {
      lead: "4. Pick the day and time.",
      text: "Choose Now, Pick a time, or Best time. Best time suggests slots from when your own past posts got the most engagement, and only shows a slot once at least two of your posts landed in it, so one lucky upload doesn't become advice.",
    },
    {
      type: "image",
      image: {
        src: `${dir}/step-2-caption-time.webp`,
        alt: "The composer's Caption step with a YouTube title, an empty caption box with a Draft with AI button and a hashtags field, above the When step offering Now, Best time or Pick a time, with three suggested weekly time slots.",
        width: 646,
        height: 528,
        caption: "Steps 3 and 4: caption (or Draft with AI), then a time. The engagement figures for this account are blurred.",
      },
    },
    {
      lead: "5. Post it to Facebook when it's due.",
      text: "Clipiro doesn't upload to Facebook or Instagram for you; only YouTube posts automatically. For Facebook, a scheduled post becomes your turn when it's due: you get a notification, and the post is waiting under Posts with the video and caption ready to copy. Upload it as a Reel on Facebook, then add the link back in Clipiro so the post is tracked.",
    },
    {
      type: "callout",
      tone: "tip",
      title: "Leave yourself spare clips",
      text: "Cut a few more clips than you need. If one doesn't feel right on the day, or Facebook doesn't count a Reel, you can still post on that day without opening an editor.",
    },
    {
      heading: "Before you apply",
      text: "Read the full terms for your region, and check which of your Reels will count. The programme page says Meta decides what qualifies, and that it has to be your own work. Clips cut from a video you made are your own work; reposting someone else's footage isn't.",
    },
    {
      type: "callout",
      tone: "stat",
      text: `Try it on your own footage first: a new Clipiro account starts with ${FREE_TIER_SIGNUP_MINUTES} free Clip Minutes and gets ${FREE_TIER_MONTHLY_BONUS_MINUTES} more each month, with watermarked clips. AutoClip uses one Clip Minute per minute of video you upload, however many clips it finds.`,
    },
    {
      type: "cta",
      heading: "Turn one long video into a month of Reels",
      body: "Cut the clips with AutoClip, then line them up day by day in Social Tracker.",
      label: "Start free",
      href: "/register",
    },
  ],
  faqs: [
    {
      question: "What is Facebook Creator Fast Track?",
      answer:
        "A Meta programme for creators who are established on other platforms but new to Facebook. It offers guaranteed monthly payments for three months for posting eligible Reels, plus extra reach. Meta's US announcement lists $1,000 a month at 100,000+ followers and $3,000 a month at 1 million+.",
    },
    {
      question: "Who can join Creator Fast Track College Edition?",
      answer:
        "US-based college creators with at least 1,000 followers on Instagram, TikTok or YouTube, who apply with a valid .edu email address. Meta added it in a 13 November 2026 update to the programme.",
    },
    {
      question: "How many Reels do you have to post for Creator Fast Track?",
      answer:
        "Meta's programme page asks for 20 qualifying Reels a month, posted on 20 different days, for each month of the three. The terms can differ by country, so check the page for yours.",
    },
    {
      question: "Can Clipiro post Reels to Facebook automatically?",
      answer:
        "No. Clipiro posts to YouTube automatically. For Facebook and Instagram, you schedule the post in Clipiro, and when it's due it waits for you with the video and caption ready, so you can upload it yourself and add the link.",
    },
  ],
  closing:
    "Creator Fast Track pays for consistency, not one lucky Reel. If you already make long videos, you're most of the way there: cut a month of clips in one sitting, give each one its own day, and spend the time you save on the next long video.",
};
