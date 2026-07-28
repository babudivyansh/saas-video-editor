import type { BlogPost } from "../types";
import { AUTHORS } from "../authors";

export const hooksThatStopTheScroll: BlogPost = {
  slug: "hooks-that-stop-the-scroll",
  category: "Tutorial",
  title: "Writing hooks that stop the scroll in 3 seconds",
  metaDescription:
    "Master the first 3 seconds of short-form video with proven hook formulas, a hook-testing method, and caption tricks that stop viewers from scrolling past.",
  publishedAt: "2025-09-22",
  updatedAt: "2026-07-26",
  author: AUTHORS.editorial,
  intro:
    "The hook isn't the first sentence of your video. It's the first sentence someone hears while deciding whether to keep watching — and on a feed that refreshes every second, that decision happens faster than you can finish a normal introduction.",
  body: [
    {
      heading: "The hook is a decision window, not a sentence",
      text: "Every short-form platform works the same way at the mechanical level: a viewer's thumb is already in motion, and your video has a fraction of a second to interrupt it. That's not a line you deliver — it's a state you have to create in the first frame, the first word, and the first visual, simultaneously. Treat the hook as a decision window you're trying to win, not a sentence you're trying to write well, and the rest of this gets much easier.",
    },
    {
      lead: "Cut the setup entirely.",
      text: "\"Hey guys, today I want to talk about...\" is three seconds of nothing. Start at the claim, the question, or the moment of conflict. If your video is about a mistake you made, open on the mistake — explain how you got there afterward, if at all. Compare \"So today I want to share a story about a marketing decision that didn't go the way I planned\" against \"I spent $8,000 on ads that made zero sales.\" Both describe the same video. Only one earns the next three seconds.",
    },
    {
      lead: "Say the outcome before the explanation.",
      text: "\"I lost $10,000 doing this\" earns more attention than \"let me tell you about a financial decision I made.\" Specificity beats setup every time — a number, a name, a concrete consequence. This works because the outcome creates a question in the viewer's head (\"how?\" or \"why?\") that only watching further can answer — you're front-loading the curiosity gap instead of building toward it.",
    },
    {
      lead: "Ask a question the viewer can't not answer in their head.",
      text: "\"Do you know why your videos stop getting views after 10 seconds?\" works because most people watching a video about video editing have wondered exactly that. The question has to be one your specific audience is already asking themselves — a generic question (\"want to know a secret?\") doesn't work because it isn't targeted at a real, pre-existing curiosity.",
    },
    {
      heading: "Match the visual to the hook line",
      text: "If your hook is \"this one setting changed everything,\" the first frame should show the setting, not your face saying the sentence. A caption reinforcing the spoken hook — not just repeating it — gives you a second chance to land it for anyone watching on mute, which on most platforms is close to half of your audience at any given moment. A mismatch between what you're saying and what's on screen in the first second is one of the most common, and most fixable, reasons a strong hook line still underperforms.",
    },
    {
      lead: "Front-load captions, don't just caption everything evenly.",
      text: "Animated, karaoke-style captions that emphasize the hook word — the number, the surprising claim — do more work than uniform captions across the whole clip. Clipiro's caption editor lets you restyle a clip's captions independently after it renders, including which words get emphasized, so you can go back and punch up just the hook line without re-exporting the whole clip.",
    },
    {
      heading: "Test hooks the way you'd test a headline",
      text: "Write three hook options for the same underlying clip before you commit to one. Read all three back to yourself cold, with no context, the way a scrolling stranger would encounter them. If you can't immediately tell which one is strongest, the audience won't be able to either — which usually means none of the three is specific enough yet, and it's worth pushing for a fourth option with a harder number or a sharper claim.",
    },
    {
      heading: "Hook mistakes that are easy to miss in your own footage",
      text: "The most common failure isn't a bad hook line — it's a good hook line delivered one beat too late. Creators frequently keep a half-second of throat-clearing, a breath, or a \"so\" before the actual hook because it feels more natural in playback. On a feed, that half-second is the difference between someone stopping and someone scrolling past. Clipiro's Smart Audio Trimming removes dead air and filler words automatically with an adjustable silence threshold, so the gap between \"video starts\" and \"hook lands\" gets closed without you manually scrubbing waveforms.",
    },
  ],
  faqs: [
    {
      question: "What's the difference between a hook and an intro?",
      answer:
        "An intro sets context before getting to the point; a hook starts at the point and explains context afterward, if at all. On short-form video, an intro costs you the first three seconds — the exact window a viewer uses to decide whether to keep watching.",
    },
    {
      question: "How long should a hook actually be?",
      answer:
        "Under three seconds, ideally closer to one. A hook is a single sentence or claim, not a paragraph — if it takes more than one breath to say, it's probably still setup, not the hook itself.",
    },
    {
      question: "Should captions repeat the spoken hook word-for-word?",
      answer:
        "No — captions should reinforce the hook, not just transcribe it. Emphasizing the key word (the number, the surprising claim) with animated or karaoke-style styling gives viewers watching on mute a second, faster way to register why the clip matters.",
    },
    {
      question: "How do I know if my hook is actually working?",
      answer:
        "Watch your retention graph, not your view count. A hook that's working shows a flat or slowly declining line in the first three seconds; a hook that's failing shows a steep drop right at the start, before your main point has even been introduced.",
    },
    {
      question: "Can I change a clip's hook after it's already rendered?",
      answer:
        "Yes — Clipiro's transcript editor lets you trim the start of a clip and adjust captions after rendering, so you can tighten a hook that's landing one beat late without re-uploading or re-cutting the source video.",
    },
  ],
  closing:
    "Test hooks the same way you'd test a headline: write three options for the same clip, and if you can't tell which is strongest by reading them cold, the audience won't be able to either. Run your next batch of clips through Clipiro and use the transcript editor to tighten the first three seconds before you post.",
};
