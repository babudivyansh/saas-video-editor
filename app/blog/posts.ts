// Blog content lives here as plain data — no MDX/CMS pipeline yet, just
// enough structure to render real posts. `lead` is the bolded opening phrase
// of a paragraph; `text` is the rest of it.
export interface BlogParagraph {
  lead?: string;
  text: string;
}

export interface BlogPost {
  slug: string;
  tag: string;
  title: string;
  read: string;
  intro: string;
  paragraphs: BlogParagraph[];
  closing: string;
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "podcast-to-viral-clips",
    tag: "Guide",
    title: "How to turn a 1-hour podcast into 10 viral clips",
    read: "5 min read",
    intro:
      "A one-hour podcast episode has maybe 90 seconds of clip-worthy material — the trick isn't finding more moments, it's finding the right ones fast enough that clipping doesn't become a second full-time job.",
    paragraphs: [
      {
        lead: "Start with the moments your guest didn't plan.",
        text: "The best clips are rarely the rehearsed pitch or the polished answer — they're the unscripted tangent, the disagreement, the moment someone says something they immediately qualify with \"I probably shouldn't say this, but.\" Scan for emotional shifts, not just information density.",
      },
      {
        lead: "Cut for the first three seconds, not the whole clip.",
        text: "A viewer decides whether to keep watching before your point has even landed. If the first sentence doesn't work as a cold open — no \"so basically\" or \"as I was saying\" — trim until it does, even if that means starting mid-sentence.",
      },
      {
        lead: "One clip, one idea.",
        text: "Clips that try to cover two points read as unfocused and lose viewers at the pivot. If a moment has two good ideas, that's two clips, not one longer one.",
      },
      {
        lead: "Let the AI do the first pass, you do the edit.",
        text: "Clipiro's AutoClip scans for hook strength, pacing, and payoff automatically and proposes a shortlist with a virality score per clip — your job shifts from scrubbing a 60-minute timeline to reviewing 10-15 candidates and deciding which to keep, trim, or drop. That review step matters: even a strong AI pick can improve with two seconds shaved off the front.",
      },
      {
        lead: "Batch by theme, not by recording date.",
        text: "If you've got a backlog of episodes, group clips by topic before scheduling posts — five clips about the same theme released over two weeks builds a stronger signal to the algorithm (and your audience) than one-per-episode randomness.",
      },
    ],
    closing:
      "A 60-minute episode reliably produces 8-12 usable clips once you stop looking for \"the best moment\" and start looking for every moment that stands alone.",
  },
  {
    slug: "hooks-that-stop-the-scroll",
    tag: "Tutorial",
    title: "Writing hooks that stop the scroll in 3 seconds",
    read: "4 min read",
    intro:
      "The hook isn't the first sentence of your video. It's the first sentence someone hears while deciding whether to keep watching — and on a feed that refreshes every second, that decision happens faster than you can finish a normal introduction.",
    paragraphs: [
      {
        lead: "Cut the setup entirely.",
        text: "\"Hey guys, today I want to talk about...\" is three seconds of nothing. Start at the claim, the question, or the moment of conflict. If your video is about a mistake you made, open on the mistake — explain how you got there afterward, if at all.",
      },
      {
        lead: "Say the outcome before the explanation.",
        text: "\"I lost $10,000 doing this\" earns more attention than \"let me tell you about a financial decision I made.\" Specificity beats setup every time — a number, a name, a concrete consequence.",
      },
      {
        lead: "Ask a question the viewer can't not answer in their head.",
        text: "\"Do you know why your videos stop getting views after 10 seconds?\" works because most people watching a video about video editing have wondered exactly that.",
      },
      {
        lead: "Match the visual to the hook line.",
        text: "If your hook is \"this one setting changed everything,\" the first frame should show the setting, not your face saying the sentence. A caption reinforcing the spoken hook (not just repeating it) gives you a second chance to land it for anyone watching on mute.",
      },
      {
        lead: "Front-load captions, don't just caption everything evenly.",
        text: "Animated, karaoke-style captions that emphasize the hook word — the number, the surprising claim — do more work than uniform captions across the whole clip.",
      },
    ],
    closing:
      "Test hooks the same way you'd test a headline: write three options for the same clip, and if you can't tell which is strongest by reading them cold, the audience won't be able to either.",
  },
  {
    slug: "smarter-clip-detection",
    tag: "Product",
    title: "What's new in Clipiro: smarter clip detection",
    read: "3 min read",
    intro:
      "AutoClip's clip-selection has gotten a real upgrade — not just \"better AI,\" but a specific set of new controls that change what the pipeline optimizes for and give you more say before anything renders.",
    paragraphs: [
      {
        lead: "Smart Auto Reframe",
        text: "now goes beyond a static center-crop. It reads the scene for who's talking, tracks between speakers when your source is a two-person conversation, and applies one of four camera-motion presets — Balanced, Minimal, Dynamic, or Cinematic — with separate Zoom Strength and Smoothness/Tracking Speed controls, so a fast-cut podcast and a calm interview don't get the same treatment by default.",
      },
      {
        lead: "Smart Audio Trimming",
        text: "removes dead air and filler words (\"um,\" \"uh,\" \"like\") automatically, with an adjustable silence threshold — so a clip that would've had three seconds of throat-clearing in the middle now cuts straight through it, without you scrubbing the timeline by hand.",
      },
      {
        lead: "Every clip is reviewable before you're charged.",
        text: "AutoClip proposes a shortlist with per-clip scoring, and you keep, trim, or drop each one — and adjust its aspect ratio — before confirming. Credits are only spent on what you actually keep, not what the AI merely suggested.",
      },
      {
        lead: "Per-clip caption re-styling and a real transcript editor",
        text: "— after a clip renders, you can restyle its captions independently (font, color, outline, animation) and correct the transcript directly, word by word, without re-uploading anything.",
      },
      {
        lead: "Dubbing now carries captions with it.",
        text: "When you dub a clip into another language, the burned-in captions translate along with the audio instead of staying in the source language.",
      },
    ],
    closing:
      "None of this changes the core promise — drop in a long video, get viral-ready shorts out — it just gives you more precise control over the parts that used to be all-or-nothing.",
  },
  {
    slug: "posting-cadence",
    tag: "Growth",
    title: "Posting cadence: how often should you publish shorts?",
    read: "6 min read",
    intro:
      "The honest answer is \"more than you're comfortable with at first, then whatever your retention data tells you\" — but that's not useful on its own, so here's how to actually find your number.",
    paragraphs: [
      {
        lead: "Start higher than feels sustainable, then pull back.",
        text: "Most creators underestimate how much volume it takes for a platform's algorithm to learn who your content is for. A short burst of daily posting for two to three weeks gives you a real signal; three posts spread over a month doesn't.",
      },
      {
        lead: "Watch retention, not views, to decide if you're overposting.",
        text: "Views can dip when you increase frequency simply because newer posts haven't had time to accumulate. Retention (how much of each clip people actually watch) tells you faster whether quality is holding up as volume goes up.",
      },
      {
        lead: "Batch-produce, but don't batch-release everything at once.",
        text: "Cutting ten clips from one long recording in one sitting is efficient. Releasing all ten in one day isn't — you lose the compounding effect of showing up repeatedly, and you give the algorithm one data point instead of ten spread over time.",
      },
      {
        lead: "Different platforms reward different cadences.",
        text: "TikTok and Instagram Reels tend to reward frequency more directly; YouTube Shorts has historically been more forgiving of a slower, steadier pace tied to a channel's existing subscriber base. If you're repurposing one long video across all three, consider staggering release rather than posting everywhere simultaneously.",
      },
      {
        lead: "The floor is \"consistent,\" not \"frequent.\"",
        text: "Three clips a week, every week, for two months will usually outperform ten clips one week and nothing for the next three. Consistency is what lets an audience form a habit around your content; frequency without consistency mostly just produces noise.",
      },
    ],
    closing:
      "If you're not sure where to start: one long-form recording a week, cut into whatever number of genuinely strong clips it contains — even if that's only three — posted on a fixed schedule, is a reasonable floor for the first month.",
  },
  {
    slug: "caption-styles-watch-time",
    tag: "Captions",
    title: "The caption styles that boost watch-time the most",
    read: "4 min read",
    intro:
      "Captions aren't just accessibility — for short-form video watched on mute in a feed, they're often the only way your content gets consumed at all. The style you pick changes how much of the message actually lands.",
    paragraphs: [
      {
        lead: "High-contrast, bold, and large beats subtle every time.",
        text: "A thin serif caption might look elegant in a preview, but at the size and viewing distance of a phone screen scrolled past in half a second, bold sans-serif styles with strong color contrast simply read faster.",
      },
      {
        lead: "Karaoke-style word highlighting outperforms static captions for retention.",
        text: "Animating each word as it's spoken — rather than showing a static line of text — gives the eye something to track in sync with the audio, which keeps attention through longer sentences that a static caption block would lose viewers on.",
      },
      {
        lead: "Color-code sparingly, not decoratively.",
        text: "A highlight color on the emphasized word in a sentence (the number, the surprising claim, the punchline) draws the eye exactly where you want it. Using multiple colors throughout a whole clip for decoration does the opposite — it splits attention instead of directing it.",
      },
      {
        lead: "Match caption style to content tone, not just brand color.",
        text: "A serious explainer and a comedic skit shouldn't necessarily use the same caption treatment even if they're for the same channel — an italic or handwriting-adjacent style can undercut a serious point, and an all-caps aggressive style can feel mismatched on a calm, informational clip.",
      },
      {
        lead: "Keep line length short.",
        text: "Two to four words per caption \"beat\" reads faster than a full sentence held on screen — if your captions are wrapping to a second line often, that's a signal to re-time the breaks, not just shrink the font.",
      },
    ],
    closing:
      "Test one style change at a time against clips that are otherwise similar in content and length — caption style is one of the few variables you can change after the fact without re-shooting anything, so it's worth actually testing rather than guessing.",
  },
  {
    slug: "localizing-clips-global-audiences",
    tag: "Multi-language",
    title: "Going global: localizing your clips for new audiences",
    read: "5 min read",
    intro:
      "The fastest way to grow an audience you don't already have isn't making more content for the audience you do have — it's making your best-performing content legible to people who don't speak the language it was made in.",
    paragraphs: [
      {
        lead: "Dub before you subtitle-only.",
        text: "Subtitles require active reading, which is a bigger ask on a feed where most viewing is passive, half-attentive scrolling. A dubbed voiceover in the viewer's language, even with captions layered on top, keeps the clip watchable on mute and with sound — Clipiro's dubbing supports 29+ languages including Hindi, Spanish, French, German, and Portuguese, carrying translated captions along with the dubbed audio automatically.",
      },
      {
        lead: "Pick your first languages by where your existing audience already is, not by market size alone.",
        text: "Check which countries show up in your current view geography before assuming the largest population wins — a mid-sized market where you already have organic pull will often outperform a huge market where you're starting from zero.",
      },
      {
        lead: "Re-clip for a new language, don't just re-dub the same cut.",
        text: "A hook built around a pun or an idiom often doesn't translate — when localizing a high-performing clip, it's worth checking whether the hook itself needs to change, not just the audio track.",
      },
      {
        lead: "Keep the caption style consistent across languages, even when the script length changes.",
        text: "Some languages run noticeably longer or shorter than English for the same sentence — if a caption style was tuned for short English bursts, check that translated captions aren't overflowing or leaving awkward gaps before publishing.",
      },
      {
        lead: "Localization compounds.",
        text: "A clip that performs in a second language becomes evidence for which of your other clips are worth localizing next — treat the first few as a test, not a one-off, and let the data pick your second wave of languages.",
      },
    ],
    closing:
      "Going global doesn't require a bigger content pipeline — it requires running your best-performing clips through one more step before they're considered finished.",
  },
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}
