import type { BlogPost } from "../types";
import { AUTHORS } from "../authors";
import { CAPTION_FAMILIES, CAPTION_TEMPLATES } from "@clipiro/shared/caption-templates";
import { DUB_LANGUAGES } from "@/lib/languages";

const devanagariTemplates = CAPTION_TEMPLATES.filter((t) => t.script === "devanagari").length;
const desiFamilies = CAPTION_FAMILIES.filter((f) => f.id === "desi" || f.id === "fest");
const desiCount = CAPTION_TEMPLATES.filter((t) => desiFamilies.some((f) => f.id === t.family)).length;

export const hindiCaptionsShortsReels: BlogPost = {
  slug: "hindi-captions-for-shorts-and-reels",
  category: "Captions",
  title: "How to add Hindi captions to Shorts and Reels",
  metaDescription:
    "Add Hindi or Hinglish captions to YouTube Shorts and Instagram Reels that render correctly: Devanagari vs Roman script, fonts, line length and timing.",
  publishedAt: "2026-11-04",
  updatedAt: "2026-11-04",
  author: AUTHORS.founder,
  intro:
    "To add Hindi captions to a Short or Reel, transcribe the clip, decide between Devanagari and Roman (Hinglish) script, then burn the captions in with a font that supports Devanagari, so matras and conjuncts render properly. Most caption tools get that last step wrong, and broken Hindi text looks worse than none.",
  body: [
    {
      heading: "Devanagari or Hinglish: pick by how your audience types",
      text: "Look at your comments. If viewers write to you in Devanagari, caption in Devanagari; if they write Hindi in Roman letters, Hinglish captions will read faster for them. Mixed-language speech (Hindi with English words) usually reads best in the script your audience already uses, with English terms left in English rather than transliterated.",
    },
    {
      heading: "Why Hindi captions often render broken",
      text: "Devanagari letters change shape depending on their neighbours: vowel signs sit before, above or below a consonant, and consonant clusters join into conjuncts. A renderer without complex text shaping draws each character on its own, so you get floating matras and split conjuncts. Use a caption tool whose export shapes Devanagari properly, and check one exported clip on a phone before you batch the rest.",
    },
    {
      lead: "In Clipiro,",
      text: `captions are shaped for Devanagari in the export, and templates whose font has no Hindi glyphs fall back to a Devanagari face for Hindi words. The caption library includes ${desiCount} templates in its ${desiFamilies.map((f) => f.name).join(" and ")} families, ${devanagariTemplates} of them designed for Devanagari from the start.`,
    },
    {
      heading: "Keep lines short and timing tight",
      text: "Hindi words are often longer on screen than their English equivalents, so show fewer words at a time: two or three per caption chunk keeps the text large enough to read on a phone. Place captions in the middle third of the frame, clear of the platform's buttons at the bottom and the profile row at the top, and make sure each chunk appears when the word is spoken, not a beat after.",
    },
    {
      heading: "Step by step",
      text: "Upload the long video to AutoClip and let it transcribe and pick clips. Check the transcript for proper nouns and English loanwords, which transcription gets wrong most often, and fix them word by word. Choose a Hindi or Hinglish caption template, preview it, then export. If you also want an English version, translate the captions or dub the clip rather than recording it again.",
    },
    {
      type: "callout",
      tone: "note",
      title: "Reaching beyond Hindi",
      text: `The same clip can be dubbed into ${DUB_LANGUAGES.length} languages, including Tamil, with translated captions re-timed to the dubbed audio.`,
    },
  ],
  faqs: [
    {
      question: "Should Hindi captions be in Devanagari or English letters?",
      answer:
        "Match how your audience writes. Devanagari suits viewers who read and type Hindi in its own script; Hinglish in Roman letters reads faster for audiences who write Hindi that way in comments and chats.",
    },
    {
      question: "Why do my Hindi captions show broken letters?",
      answer:
        "The tool is drawing Devanagari without complex text shaping, so vowel signs and conjuncts don't join. Use a caption tool and font that support Devanagari shaping, and check an exported clip on a phone.",
    },
    {
      question: "Can AI transcribe Hindi speech accurately?",
      answer:
        "Modern speech recognition handles Hindi well, but it still trips on names, slang and English words mid-sentence. Always skim the transcript and correct those before exporting.",
    },
  ],
  closing:
    "Decide the script first, make sure your export shapes Devanagari properly, and keep captions to a few large words at a time. Then check one clip on a real phone before posting the batch.",
};
