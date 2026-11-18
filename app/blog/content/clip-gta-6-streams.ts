import type { BlogPost } from "../types";
import { AUTHORS } from "../authors";
import { GAMING_CAPTION_FAMILIES } from "@/app/gta-6-clip-maker/content";
import { FREE_TIER_MONTHLY_BONUS_MINUTES, TIER_MAX_AUTOCLIP_SOURCE_SECONDS } from "@/lib/plans/tiers";

const familyNames = GAMING_CAPTION_FAMILIES.map((f) => f.name).join(", ");
const studioHours = TIER_MAX_AUTOCLIP_SOURCE_SECONDS.studio / 3600;

// Length limits match platform-guides.ts (checked there against each
// platform's own announcements); keep the two posts in step.
export const clipGta6Streams: BlogPost = {
  slug: "how-to-clip-gta-6-streams",
  category: "Guide",
  title: "How to clip GTA 6 streams into Shorts and Reels (launch-week guide)",
  metaDescription:
    "A practical guide to turning GTA 6 streams into Shorts, Reels and TikToks: what to record, how to get the VOD in, clip length, captions, spoilers and Rockstar's video policy.",
  publishedAt: "2026-11-18",
  updatedAt: "2026-11-18",
  author: AUTHORS.founder,
  intro:
    "GTA 6 is out, and for the next few weeks everyone who streams it will be competing for the same Shorts and Reels feeds. The streams are long; the clips that travel are short. Here is how to get from one to the other quickly, without spoiling the story or running into Rockstar's video policy.",
  body: [
    {
      heading: "Why the first weeks matter",
      text: "A game this size is new to everyone at once. People search for the same moments, the same glitches and the same first reactions, and short clips of those moments are what they find. A month later the novelty has moved on to guides and challenges. If you are streaming launch week, clipping it the same week is where most of the value is.",
    },
    {
      heading: "Record for clipping, not just for the stream",
      lead: "Talk.",
      text: "A clip works when a viewer who missed the stream understands it in three seconds, and your voice is what does that: the reaction, the 'wait, what', the explanation of what just went wrong. Commentary is also what clipping tools read to find the moments, so a silent run gives them far less to work with.",
    },
    {
      lead: "Keep your mic above the game.",
      text: "Duck the game audio a little under your voice. Captions are generated from speech, and a voice buried under engine noise and gunfire makes for worse captions and weaker picks.",
    },
    {
      lead: "Save the VOD.",
      text: "On Twitch, turn on Store past broadcasts so each stream stays available as a VOD after it ends. A VOD that has expired can't be clipped by anyone.",
    },
    {
      heading: "Get the stream into Clipiro",
      text: `Paste the link to a Twitch past broadcast or highlight, or a YouTube video, into AutoClip. You can also upload the recording file. Paid plans take sources up to ${studioHours} hours long, depending on the plan, and the free plan includes ${FREE_TIER_MONTHLY_BONUS_MINUTES} watermarked minutes a month to try it. A channel that is still live can be imported once the broadcast has ended.`,
    },
    {
      type: "callout",
      tone: "tip",
      title: "Twitch clips are too short to start from",
      text: "AutoClip needs at least a minute of footage, and a Twitch clip is shorter than that. Start from the full VOD or a highlight instead, and let AutoClip find the clips inside it.",
    },
    {
      heading: "Settings that work for gameplay",
      lead: "Vertical, 30 to 60 seconds.",
      text: "YouTube Shorts and Instagram Reels both allow up to three minutes now, but a gameplay clip almost always holds attention better short: one moment, set up fast, payoff before the thumb moves. Set the length range before the run and AutoClip keeps to it.",
    },
    {
      lead: "Pick a caption style that reads over chaos.",
      text: `Gameplay is busy, so captions need weight and contrast. The ${familyNames} families were made for this: pixel, glitch, neon and scoreboard looks that stay readable over explosions and HUDs.`,
    },
    {
      lead: "Read the first three seconds as a stranger.",
      text: "If the hook lands late, trim the start in the editor. If a word in the captions is wrong, fix it in the transcript and the captions follow.",
    },
    {
      type: "table",
      caption: "Maximum length on each platform (checked November 2026)",
      columns: ["Platform", "Maximum length", "What works for gameplay"],
      rows: [
        ["YouTube Shorts", "3 minutes (since October 2024)", "30–60 seconds, one moment per clip"],
        ["Instagram Reels", "3 minutes (since January 2025)", "30–60 seconds, hook in the first 2 seconds"],
        ["Facebook Reels", "Has changed several times: check the composer", "Keep well under the limit"],
      ],
    },
    {
      heading: "Don't spoil the story",
      text: "The fastest way to lose an audience in launch week is to spoil the ending for people who haven't reached it. Keep story clips to the early game, say in the title when a clip shows a mission, and leave big reveals out entirely. Rockstar's policy also singles out spoilers and cutscene compilations as content it removes.",
    },
    {
      heading: "What Rockstar's video policy says",
      text: "Rockstar publishes a policy on posting copyrighted Rockstar Games material. It covers non-commercial fan content, and it lists what gets taken down, including footage from leaked pre-release copies, story spoilers and compilations of cutscenes. Read the policy itself before you post, and especially before you put ads on GTA footage or use it to promote anything: that decision is between you and Rockstar.",
    },
    {
      type: "callout",
      tone: "note",
      text: "The full policy is on Rockstar's support site, titled \"Policy on posting copyrighted Rockstar Games material\". Our GTA 6 clip maker page links to it directly.",
    },
    {
      heading: "A posting rhythm for launch week",
      text: "Post while the moment is fresh, but don't dump twenty clips in an hour. One to three a day, spread out, gives each clip a chance to find its audience before the next one competes with it. Our posting cadence guide goes into how often, and when, in more detail.",
    },
    {
      type: "cta",
      heading: "Clip your GTA 6 stream",
      body: "Paste your Twitch or YouTube VOD and get captioned vertical clips back.",
      label: "Try the GTA 6 clip maker",
      href: "/gta-6-clip-maker",
    },
  ],
  faqs: [
    {
      question: "Can I clip a Twitch stream while it's still live?",
      answer: "Not while it's live. Once the broadcast has ended and the VOD is up, paste the VOD link into AutoClip.",
    },
    {
      question: "What's the best length for a GTA 6 Short?",
      answer: "Usually 30 to 60 seconds. Shorts and Reels allow up to three minutes, but one moment that pays off quickly holds attention better than a long one.",
    },
    {
      question: "Can I make money from GTA 6 clips?",
      answer: "That depends on Rockstar's policy, not on the clipping tool. Their policy on posting copyrighted material covers non-commercial fan content; read it before monetizing anything.",
    },
    {
      question: "Does AutoClip work on gameplay with no commentary?",
      answer: "Not well. It finds moments from what is said, so a recording with only game audio gives it little to choose from. Streams where you talk work best.",
    },
  ],
  closing:
    "Launch week rewards speed, but the clips that keep getting views are the ones a stranger understands instantly. Talk while you play, keep the VOD, cut short and caption loud, and leave the story for people to discover themselves.",
};
