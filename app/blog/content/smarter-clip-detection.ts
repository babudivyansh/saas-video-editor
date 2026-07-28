import type { BlogPost } from "../types";
import { AUTHORS } from "../authors";

export const smarterClipDetection: BlogPost = {
  slug: "smarter-clip-detection",
  category: "Product",
  title: "What's new in Clipiro: smarter clip detection",
  metaDescription:
    "Clipiro's AutoClip just got smarter: Smart Auto Reframe presets, Smart Audio Trimming, per-clip caption restyling, a transcript editor, and dubbing that carries captions.",
  publishedAt: "2025-10-13",
  updatedAt: "2026-07-26",
  author: AUTHORS.product,
  intro:
    "AutoClip's clip-selection has gotten a real upgrade — not just \"better AI,\" but a specific set of new controls that change what the pipeline optimizes for and give you more say before anything renders.",
  body: [
    {
      heading: "Why this update exists",
      text: "The original version of AutoClip made one decision for you: crop to a center frame, cut silence uniformly, apply one caption style to everything. That's fine for simple talking-head content, but it breaks down fast for two-person interviews, fast-cut podcasts, and anything that needs a different visual rhythm than a straight-to-camera monologue. This update replaces those one-size-fits-all defaults with controls that adapt to what's actually in your footage.",
    },
    {
      heading: "Smart Auto Reframe",
      lead: "Smart Auto Reframe",
      text: "now goes beyond a static center-crop. It reads the scene for who's talking, tracks between speakers when your source is a two-person conversation, and applies one of four camera-motion presets — Balanced, Minimal, Dynamic, or Cinematic — with separate Zoom Strength and Smoothness/Tracking Speed controls, so a fast-cut podcast and a calm interview don't get the same treatment by default. Balanced is the sensible default for most content; Dynamic suits high-energy commentary where quick cuts between speakers read as natural; Cinematic slows the tracking speed for a more deliberate, editorial feel that suits long-form interviews and documentary-style content.",
    },
    {
      heading: "Smart Audio Trimming",
      lead: "Smart Audio Trimming",
      text: "removes dead air and filler words (\"um,\" \"uh,\" \"like\") automatically, with an adjustable silence threshold — so a clip that would've had three seconds of throat-clearing in the middle now cuts straight through it, without you scrubbing the timeline by hand. The threshold control matters more than it sounds: a threshold that's too aggressive can clip out natural pauses that carry emphasis, while one that's too lenient leaves in exactly the dead air you were trying to remove. Start with the default and adjust per-project if your speakers have a naturally slower or faster cadence.",
    },
    {
      heading: "Review every clip before you're charged",
      text: "AutoClip proposes a shortlist with per-clip scoring, and you keep, trim, or drop each one — and adjust its aspect ratio — before confirming. Credits are only spent on what you actually keep, not what the AI merely suggested. This was true before this update too, but it's worth restating because it's the core design principle behind every other change here: the AI's job is to produce a strong starting shortlist fast, not to make final calls autonomously.",
    },
    {
      heading: "Per-clip caption re-styling and a real transcript editor",
      text: "after a clip renders, you can restyle its captions independently — font, color, outline, animation — and correct the transcript directly, word by word, without re-uploading anything. This closes a workflow gap that used to force a full re-render for even a small caption tweak: fix a misheard name, tighten a caption's timing, or switch from a static style to karaoke-style word highlighting, all on a clip that's already exported.",
    },
    {
      heading: "Dubbing now carries captions with it",
      text: "When you dub a clip into another language, the burned-in captions translate along with the audio instead of staying in the source language. Previously, localizing a clip meant dubbing the voiceover and then manually retiming captions in the new language — a step that discouraged a lot of creators from localizing at all. Now the caption track updates automatically to match the dubbed language and timing.",
    },
    {
      heading: "How to try it on your next upload",
      text: "None of this requires a new workflow — upload a video to AutoClip as usual, and Smart Auto Reframe and Smart Audio Trimming apply by default with sensible presets. To fine-tune, open a proposed clip before confirming it and adjust the reframe preset, zoom strength, or silence threshold from the clip's settings panel. Caption restyling and transcript editing are available on any rendered clip from your Clips library, and dubbing is available from the same clip view under the localization tools.",
    },
  ],
  faqs: [
    {
      question: "Do I need to change my workflow to use the new Smart Auto Reframe presets?",
      answer:
        "No — Balanced is applied by default on every upload. The four presets (Balanced, Minimal, Dynamic, Cinematic) are optional overrides you can pick per clip if the default motion doesn't suit your footage.",
    },
    {
      question: "What does the Smart Audio Trimming silence threshold actually control?",
      answer:
        "It controls how aggressively pauses and filler words are cut. A higher threshold removes more silence (tighter pacing, but risk of cutting natural pauses); a lower threshold is more conservative. It's adjustable per project so you can match a speaker's natural cadence.",
    },
    {
      question: "Can I restyle captions after a clip has already been exported?",
      answer:
        "Yes — caption restyling (font, color, outline, animation) and word-by-word transcript correction are both available on any rendered clip in your Clips library, without needing to re-upload the source video.",
    },
    {
      question: "Does dubbing support caption translation automatically?",
      answer:
        "Yes. When you dub a clip into one of Clipiro's 29+ supported languages, the burned-in captions translate and re-time to match the dubbed audio automatically — you don't need to manually re-caption a localized version.",
    },
    {
      question: "Am I charged credits for clips AutoClip suggests but I don't keep?",
      answer:
        "No. AutoClip's shortlist is free to review — credits are only deducted for clips you confirm and export, not for every candidate the AI proposes.",
    },
  ],
  closing:
    "None of this changes the core promise — drop in a long video, get viral-ready shorts out — it just gives you more precise control over the parts that used to be all-or-nothing. Upload your next video and try the new reframe presets and transcript editor for yourself.",
};
