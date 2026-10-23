// Homepage FAQ copy. A plain module (not the "use client" FAQ.tsx) so the
// server-rendered FAQPage JSON-LD in app/page.tsx can read the same array —
// search engines require the structured data to match the visible questions.
export const HOME_FAQS: { q: string; a: string }[] = [
  { q: "What is Clipiro?", a: "Clipiro is an AI-powered video tool that turns long videos — podcasts, interviews, webinars, and YouTube uploads — into viral short-form clips with automatic clipping, captions, and social formatting." },
  { q: "How does AI clipping work?", a: "Our AI analyzes your video for hooks, punchlines, and high-retention moments, then trims them into ready-to-post shorts. You can review, tweak, and export — no manual scrubbing required." },
  { q: "Do I need editing skills?", a: "Not at all. Clipiro is built for creators of every level. Upload a video, let the AI do the heavy lifting, and customize captions or framing with a few clicks." },
  { q: "Which platforms are supported?", a: "Clips are optimized for YouTube Shorts, Instagram Reels, and Facebook — with 9:16, 1:1, and 16:9 presets so one project works everywhere." },
  { q: "Is there a free plan?", a: "Yes. Create a free account — no credit card — and the free tools are yours to use. Upgrade to a paid plan when you need more Clip Minutes, credits and premium features." },
  { q: "How accurate are the captions?", a: "Captions are generated with word-level timing and are highly accurate across accents and languages. You can edit any word and restyle the look to match your brand." },
  { q: "Can I edit clips manually?", a: "Absolutely. Every AI suggestion is fully editable — adjust trims, captions, framing, hooks, and brand styles in the editor before exporting." },
  { q: "Do you support multiple languages?", a: "Yes — Clipiro supports captions and voiceovers in 29+ languages including Hindi, English, Spanish, French, German, and Portuguese, powered by ElevenLabs voices." },
  { q: "What video formats are supported?", a: "You can work with common formats like MP4, MOV, and more, and export publish-ready clips in crisp 1080p across multiple aspect ratios." },
  { q: "Can I keep clips on-brand?", a: "Yes. Save your fonts, caption colours and styles as brand kits and apply them to any clip, so everything you publish looks consistent." },
];
