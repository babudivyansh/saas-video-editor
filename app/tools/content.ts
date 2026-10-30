// Marketing copy for the public tool pages at /tools/<slug>.
//
// Kept separate from featureLinks.ts on purpose: that file is the link graph
// (title, in-app href, slug) shared with the dashboard, this one is page copy
// that only the marketing site reads. Same split as app/help/articles.ts and
// app/legal/documents.ts.
//
// Every slug in ALL_TOOLS must have an entry here — see the coverage test in
// app/tools/content.test.ts.

import { CAPTION_TEMPLATES } from "@clipiro/shared/caption-templates";

/** Counted, not typed: the caption library grows in weekly drops. */
const CAPTION_TEMPLATE_COUNT = CAPTION_TEMPLATES.length;

export interface ToolStep {
  title: string;
  body: string;
}

export interface ToolBenefit {
  title: string;
  body: string;
}

export interface ToolFaq {
  question: string;
  answer: string;
}

export interface ToolContent {
  /** Page <h1>. Leads with the verb — this is what the visitor came to do. */
  h1: string;
  metaTitle: string;
  metaDescription: string;
  lede: string;
  steps: [ToolStep, ToolStep, ToolStep];
  benefits: ToolBenefit[];
  faqs: ToolFaq[];
}

const CREDITS_FAQ: ToolFaq = {
  question: "How do credits work?",
  answer:
    "Every plan shares one credit balance you can spend on any paid AI tool (AutoClip runs on separate Clip Minutes). Subscription credits refill each month and roll over up to 2× your monthly allowance; add-on credit packs never expire. Free tools never touch your balance.",
};

const CANCEL_FAQ: ToolFaq = {
  question: "Can I cancel anytime?",
  answer:
    "Yes. Plans are month-to-month with no lock-in, and there is a 3-day money-back guarantee on every paid plan. You keep access until the end of the period you have already paid for.",
};

const COMMERCIAL_FAQ: ToolFaq = {
  question: "Can I use the output commercially?",
  answer:
    "Yes. Every plan includes a commercial license, so you can monetize what you create on YouTube, TikTok, Instagram, or for client work.",
};

const FREE_TOOL_FAQ: ToolFaq = {
  question: "Is this really free?",
  answer:
    "Yes — it spends no credits, on every plan including the free one. There is a generous daily limit per account so it stays fast for everyone.",
};

export const TOOL_CONTENT: Record<string, ToolContent> = {
  // ---------------------------------------------------------------- video --
  "video-editor": {
    h1: "Edit video in the browser, nothing to install",
    metaTitle: "Online Video Editor — Multi-Track Timeline",
    metaDescription:
      "Edit video in your browser with a multi-track timeline. Trim, layer, caption, and export in full resolution. No download, no install.",
    lede: "A real multi-track timeline in a browser tab. Cut, layer audio, caption, and export at full resolution without downloading a thing.",
    steps: [
      { title: "Open the editor", body: "Start a project and drop in video, audio, or images — or pull something you already made from your asset library." },
      { title: "Build your timeline", body: "Stack tracks, trim clips, add captions and overlays, and scrub the preview until it lands the way you want." },
      { title: "Export", body: "Render at full resolution with no watermark on any paid plan, then download or send it straight to your next tool." },
    ],
    benefits: [
      { title: "Nothing to install", body: "Runs in the browser on any machine. No multi-gigabyte download, no plugin licences, no render farm." },
      { title: "Multi-track, not single-clip", body: "Layer video, music, voiceover, and text on separate tracks so you can adjust one without rebuilding the rest." },
      { title: "Connected to every other tool", body: "Anything you generate elsewhere in Clipiro — voiceovers, AI images, clipped highlights — drops straight onto the timeline." },
    ],
    faqs: [
      { question: "Do I need a powerful computer?", answer: "No. The heavy rendering happens on our servers, so the editor stays responsive on modest laptops. You need a current browser and a stable connection." },
      { question: "Is there a watermark?", answer: "The free plan watermarks exports. Every paid plan exports clean at full resolution." },
      COMMERCIAL_FAQ,
      CANCEL_FAQ,
    ],
  },

  "auto-clip": {
    h1: "Turn one long video into a week of clips",
    metaTitle: "AutoClip — Long Video to Short Clips with AI",
    metaDescription:
      "Drop in a podcast, stream, or interview and AutoClip finds the strongest moments, captions them, and cuts them to vertical. 30 free minutes a month.",
    lede: "Drop in a podcast, stream, or interview. AutoClip finds the moments worth posting, captions them, reframes them vertical, and hands back a set of ready-to-upload shorts.",
    steps: [
      { title: "Add your video", body: "Upload a file or paste a link. Paid plans handle uploads from two hours up to six, depending on your plan." },
      { title: "AutoClip finds the moments", body: "It scans the transcript and the audio for self-contained, high-energy segments rather than slicing on a fixed timer." },
      { title: "Review and export", body: "Each clip arrives captioned and reframed to vertical. Keep what works, adjust anything in the editor, and export." },
    ],
    benefits: [
      { title: "Hours become minutes", body: "The slow part of clipping is watching everything back to find the good bits. That is the part AutoClip removes." },
      { title: "Captioned and reframed already", body: "Clips come out vertical with burned-in captions, so they are postable without another pass." },
      { title: "Priced per minute of video, not per clip", body: "One Clip Minute per minute of source, however many clips come out of it. Re-running the same video within 7 days is free." },
    ],
    faqs: [
      { question: "How long can the source video be?", answer: "The free plan takes videos up to 30 minutes, Creator up to 2 hours, Pro up to 4, and Studio up to 6." },
      { question: "How is AutoClip priced?", answer: "In Clip Minutes: one minute per minute of source video, however many clips it produces. Creator includes 150 minutes a month, Pro 400, and Studio 1,000. The free plan gets 30 watermarked minutes a month." },
      { question: "Can I edit the clips afterwards?", answer: "Yes. Every clip opens in the editor, so you can retime the cut, change the caption style, or swap the crop before exporting." },
      { question: "What source videos work best?", answer: "Anything with clear speech — podcasts, interviews, streams, lectures, reaction videos. Clean audio matters more than resolution." },
      COMMERCIAL_FAQ,
    ],
  },

  "cut-and-crop": {
    h1: "Cut and reframe a clip in under a minute",
    metaTitle: "Cut & Crop — Trim and Reframe Video Online",
    metaDescription:
      "Trim video to the exact moment and crop it to vertical, square, or wide. A fast single-purpose tool for when you already know the cut you want.",
    lede: "For when you already know the ten seconds you want. Set the in and out points, pick an aspect ratio, export. No timeline to set up.",
    steps: [
      { title: "Upload your clip", body: "Drop in a file or reuse something from your asset library." },
      { title: "Set the cut and the frame", body: "Drag the in and out handles, then choose vertical, square, or widescreen and position the crop box." },
      { title: "Export", body: "Render it out at full quality, ready to upload or to carry into another tool." },
    ],
    benefits: [
      { title: "Faster than opening a timeline", body: "One clip, two decisions, done. The full editor is there when you need it — this is for when you do not." },
      { title: "Every aspect ratio that matters", body: "9:16 for Shorts, Reels, and TikTok, 1:1 for feeds, 16:9 for YouTube — switch between them without re-uploading." },
      { title: "Stitch as you go", body: "Join several trimmed clips into one sequence without leaving the tool." },
    ],
    faqs: [
      { question: "Does cropping lose quality?", answer: "You lose the pixels outside the crop box, as with any crop, but everything inside it is re-encoded at full quality with no additional compression pass." },
      { question: "Can I join multiple clips?", answer: "Yes — trim each one and stitch them into a single output before exporting." },
      CREDITS_FAQ,
      COMMERCIAL_FAQ,
    ],
  },





  "caption-studio": {
    h1: "Caption any video, then make every word yours",
    metaTitle: "Caption Studio — Templates, Edited Word by Word",
    metaDescription:
      `Upload a video in any shape, pick one of ${CAPTION_TEMPLATE_COUNT} caption templates, then edit, recolour and time every word. Export vertical, square and wide versions in one go.`,
    lede: "Auto-captions get you most of the way. Caption Studio is for the rest: pick a template, fix any word, make the ones that matter stand out, and export every shape you post in.",
    steps: [
      { title: "Bring your video", body: "Upload it or pick it from your asset library — vertical, horizontal, square or an odd crop. Choose the shape to work in, or keep its own." },
      { title: "Pick a template, then edit", body: "Your speech is transcribed and laid out in the template you pick. Retype any word, recolour it, make it bigger, box it, add an emoji or shift its timing." },
      { title: "Export every shape", body: "Tick 9:16, 4:5, 1:1, 16:9 or the original. The captions re-fit each shape, and the whole set renders for one credit." },
    ],
    benefits: [
      { title: "Every word is editable", body: "Not just the text: each word can carry its own colour, size, box, shake or emoji, and its own start and end time." },
      { title: "One look, every shape", body: "Style the captions once and preview them in three shapes side by side. Wide frames automatically get longer lines placed lower, so they never cover the subject." },
      { title: "Save your look", body: "Keep a style as your own template and start new projects with it — font, colours, size, position and motion included." },
    ],
    faqs: [
      { question: "What does it cost?", answer: "Transcribing uses Clip Minutes — one per minute of video. Exporting costs one credit for the whole set of shapes you pick, and is refunded if nothing renders. Caption files (SRT and VTT) are free." },
      { question: "Which templates can I use?", answer: `All ${CAPTION_TEMPLATE_COUNT} Clipiro caption templates, including Hindi-ready ones. Some templates need the Creator or Pro plan; the rest are free on every plan.` },
      { question: "Can I get the captions without burning them in?", answer: "Yes — download them as an SRT or VTT file and upload that to YouTube, LinkedIn or anywhere else that takes caption files." },
      { question: "How many looks can I save?", answer: "One on the free plan, three on Creator, five on Pro and ten on Studio." },
      CREDITS_FAQ,
      COMMERCIAL_FAQ,
    ],
  },

  // ------------------------------------------------------------------- ai --
  "ai-image-generator": {
    h1: "Generate images without nine subscriptions",
    metaTitle: "AI Image Generator — Nine Models, One Balance",
    metaDescription:
      "Generate images with Flux 2, Seedream 5.0, GPT Image 2, Ideogram 4, Nano Banana Pro, and more — all from one credit balance, no separate subscriptions.",
    lede: "Nine models behind one prompt box and one credit balance — Flux 2, Seedream 5.0, GPT Image 2, Ideogram 4 and more, with no separate plan for each.",
    steps: [
      { title: "Write your prompt", body: "Describe the image. The built-in prompt enhancer will expand a short idea into something more specific, free of charge." },
      { title: "Pick a model", body: "Different models suit different jobs — photoreal, illustration, text-in-image. Switch between them without leaving the page." },
      { title: "Generate and reuse", body: "Every image is saved to your asset library, ready to drop into a video, thumbnail, or another tool." },
    ],
    benefits: [
      { title: "One subscription, not nine", body: "Access models that would otherwise each need their own plan, all drawing from the same credit balance." },
      { title: "Prompt enhancement is free", body: "The enhancer costs no credits, so you can iterate on the prompt before spending anything on a render." },
      { title: "Goes straight into your videos", body: "Generated images land in your asset library and drop onto the editor timeline directly." },
    ],
    faqs: [
      { question: "Which models are available?", answer: "Gemini 2.5 Flash Image, Seedream 5.0, GPT Image 2, Flux 2, Nano Banana 2, Ideogram 4, Krea 2, and Qwen Image 2.0. Nano Banana Pro is Studio-only." },
      { question: "How many credits does an image cost?", answer: "It depends on the model — cheaper models cost less per image. The pricing page lists the cost of every model, and the credit calculator estimates a monthly total from your expected usage." },
      COMMERCIAL_FAQ,
      CREDITS_FAQ,
    ],
  },

  "ai-voiceover": {
    h1: "Narrate anything in a voice that sounds real",
    metaTitle: "AI Voiceover Generator — 20+ Narrators",
    metaDescription:
      "Turn a script into a natural-sounding voiceover with 20+ narrators across accents and languages. Captions sync in the editor.",
    lede: "Paste a script, pick from more than twenty narrators, and get natural-sounding audio back in seconds — ready to caption in the editor.",
    steps: [
      { title: "Paste your script", body: "Type or paste the text. Punctuation shapes the delivery, so commas and full stops are worth getting right." },
      { title: "Choose a narrator", body: "Browse twenty-plus voices across accents and languages, and preview any of them before you spend a credit." },
      { title: "Generate", body: "Download the audio or send it straight to the editor, where captions can be generated in sync with it." },
    ],
    benefits: [
      { title: "Twenty-plus voices", body: "Enough range to give different channels and formats their own identity instead of reusing one recognisable narrator." },
      { title: "Captions that match", body: "Because the timing comes from the generated audio, captions land on the word rather than near it." },
      { title: "Multiple languages", body: "Narrate in several languages to take the same script to a different audience." },
    ],
    faqs: [
      { question: "How many voices are there?", answer: "More than twenty narrators, spanning a range of accents and several languages. You can preview any voice before generating." },
      { question: "Can I generate in other languages?", answer: "Yes — multiple languages are supported, with narrators suited to each." },
      COMMERCIAL_FAQ,
      CREDITS_FAQ,
    ],
  },

  "ai-face-swap": {
    h1: "Swap a face into a photo in seconds",
    metaTitle: "AI Face Swap for Photos",
    metaDescription:
      "Put one face onto the person in another photo with AI. Upload two images, confirm you have permission, and get the swapped photo back in seconds.",
    lede: "Put one face onto the person in another photo. Use clear, front-facing shots and the result blends into the original image.",
    steps: [
      { title: "Upload the target", body: "Add the photo you want to change." },
      { title: "Add the face", body: "Upload a clear, well-lit reference of the face to swap in. Front-facing works best." },
      { title: "Generate", body: "Confirm you have permission to use both faces, and the swapped photo saves to your asset library." },
    ],
    benefits: [
      { title: "Seconds, not an editing session", body: "No masking or manual blending — upload two photos and you're done." },
      { title: "Built-in consent check", body: "Every swap asks you to confirm you have permission to use the faces involved." },
      { title: "Straight into an edit", body: "Results drop into your asset library, ready for the timeline." },
    ],
    faqs: [
      { question: "Which plans include Face Swap?", answer: "Face Swap is available on Pro and Studio." },
      { question: "What makes a good reference photo?", answer: "A clear, well-lit, roughly front-facing shot with the whole face visible. Sunglasses, heavy shadow, and extreme angles all reduce quality." },
      { question: "Are there rules about whose face I can use?", answer: "Yes. Only swap faces you have permission to use. Creating misleading or non-consensual content is against the terms of service and will get an account suspended." },
      CREDITS_FAQ,
    ],
  },

  "background-remover": {
    h1: "Cut the background out of any photo",
    metaTitle: "AI Background Remover for Images",
    metaDescription:
      "Cut the background out of a photo automatically — clean edges around hair, transparent PNG output ready to composite.",
    lede: "Remove the background from a photo in one pass, with edges clean enough around hair to composite straight onto something else.",
    steps: [
      { title: "Upload", body: "Add a PNG, JPG or WEBP image up to 10 MB." },
      { title: "Let it cut", body: "The subject is detected and separated automatically. No manual masking or green screen needed." },
      { title: "Export", body: "Download with a transparent background, or drop it onto a new background in the editor." },
    ],
    benefits: [
      { title: "One credit a photo", body: "Cheap enough to cut out every thumbnail subject, not just the important ones." },
      { title: "Holds up on hair", body: "The edges that usually betray a cutout — hair and fine detail — are where the model does its most careful work." },
      { title: "No green screen", body: "Shoot against whatever wall you have and remove it afterwards." },
    ],
    faqs: [
      { question: "Does it work on video?", answer: "Not yet — it works on still images (PNG, JPG, WEBP)." },
      { question: "What format is the output?", answer: "A transparent PNG, so you can composite the subject onto a new background." },
      CREDITS_FAQ,
      COMMERCIAL_FAQ,
    ],
  },

  "ai-voice-changer": {
    h1: "Keep your delivery, change whose voice it is",
    metaTitle: "AI Voice Changer — Transform Recorded Audio",
    metaDescription:
      "Convert a recording into a different voice while keeping your original delivery, timing, and emotion intact.",
    lede: "Record it yourself, then swap the voice. Your timing, pauses and emphasis survive the conversion — only the timbre changes.",
    steps: [
      { title: "Upload your recording", body: "Add audio or a video file. Clean input gives a cleaner conversion." },
      { title: "Pick the target voice", body: "Choose from the voice library and preview the result before committing credits." },
      { title: "Convert", body: "Download the new audio or send it to the editor to sit under your video." },
    ],
    benefits: [
      { title: "Your performance, kept", body: "Unlike text-to-speech, the pauses and emphasis are yours — the model changes timbre, not delivery." },
      { title: "Stay anonymous", body: "Narrate in your own voice without publishing it, which is the usual blocker for faceless channels." },
      { title: "One character, many videos", body: "Give a channel a consistent voice without needing the same person to record every script." },
    ],
    faqs: [
      { question: "How is this different from AI Voiceover?", answer: "Voiceover generates speech from written text. The Voice Changer converts an existing recording, so your own pacing and emphasis carry through." },
      { question: "Does background noise matter?", answer: "Yes. Clean input converts noticeably better — run noisy recordings through the Speech Enhancer first." },
      COMMERCIAL_FAQ,
      CREDITS_FAQ,
    ],
  },

  "ai-vocal-remover": {
    h1: "Split any track into vocals and instrumental",
    metaTitle: "AI Vocal Remover — Separate Vocals and Instrumental",
    metaDescription:
      "Split a track into clean vocal and instrumental stems with AI. Works on audio files and on the audio inside a video.",
    lede: "One pass gives you both stems: a clean backing track to build on, and an acapella lifted out of the finished mix.",
    steps: [
      { title: "Upload the track", body: "Add an audio file, or a video and it will work on the audio inside it." },
      { title: "Separate", body: "The model splits the mix into a vocal stem and an instrumental stem." },
      { title: "Download either stem", body: "Take one, take both, or send them into the editor as separate tracks." },
    ],
    benefits: [
      { title: "Both stems, one pass", body: "You get the instrumental and the acapella from a single run, not two separate jobs." },
      { title: "Works on video files", body: "No need to extract the audio first — hand it a video and it will find the track." },
      { title: "Clean enough to build on", body: "Separation is sharp enough that the instrumental holds up under a new vocal." },
    ],
    faqs: [
      { question: "Can I use the result commercially?", answer: "Your Clipiro plan includes a commercial licence for what you create, but that does not grant rights to music you do not own. Make sure you have permission for the underlying track." },
      { question: "Does it work on any genre?", answer: "Yes, though dense mixes with heavy effects on the vocal are harder to separate cleanly than sparse ones." },
      CREDITS_FAQ,
      CANCEL_FAQ,
    ],
  },

  "ai-speech-enhancer": {
    h1: "Make a bad room sound like a good one",
    metaTitle: "AI Speech Enhancer — Remove Noise, Improve Clarity",
    metaDescription:
      "Strip background noise, room echo, and hiss from a recording and bring the voice forward — rescue audio recorded in a bad room.",
    lede: "Background noise, echo and hiss come out; the voice comes forward. One pass, no EQ curves or compressor settings to learn.",
    steps: [
      { title: "Upload the recording", body: "Audio or video — it will work on the speech either way." },
      { title: "Enhance", body: "Noise, room reflections, and hiss are reduced while the voice is brought up and evened out." },
      { title: "Export", body: "Download the cleaned audio or send it straight into your edit." },
    ],
    benefits: [
      { title: "Rescues bad rooms", body: "Echo and air conditioning are the two things that make a recording sound amateur. Both come out." },
      { title: "Better source, better everything", body: "Cleaner audio improves caption accuracy, voice conversion, and AutoClip's moment detection downstream." },
      { title: "No audio engineering required", body: "One pass, no EQ curves or compressor settings to learn." },
    ],
    faqs: [
      { question: "Will it fix badly clipped audio?", answer: "It will improve it, but distortion from clipping is lost information — it cannot be fully recovered. Recording at a sensible level still matters." },
      { question: "Does it work on video files?", answer: "Yes. Upload the video and you get its cleaned-up audio back as an MP3, ready to drop under the video in the editor. Clips can be up to 90 seconds." },
      CREDITS_FAQ,
      COMMERCIAL_FAQ,
    ],
  },

  "subtitle-remover": {
    h1: "Erase burned-in captions and start over",
    metaTitle: "AI Subtitle Remover — Erase Hardcoded Captions",
    metaDescription:
      "Find and blur out hardcoded subtitles in a video with AI text detection, so you can recaption in your own style. Videos up to 10 minutes.",
    lede: "AI finds the burned-in captions and blurs them out where they appear, so you can recaption in your own style instead of stacking text on text.",
    steps: [
      { title: "Upload the video", body: "Add the clip with the burned-in subtitles." },
      { title: "Pick the caption area", body: "Bottom third for most videos, or anywhere to catch text wherever it appears." },
      { title: "Remove", body: "Detected captions are blurred out for exactly as long as they're on screen, and the cleaned video saves to your library." },
    ],
    benefits: [
      { title: "Only where the text is", body: "The blur follows the detected captions in place and time — the rest of the frame is untouched." },
      { title: "Recaption in your own style", body: "Repurpose footage that arrived captioned without ending up with two competing sets of text." },
      { title: "Frame-accurate", body: "Applied across every frame, so the removal does not flicker in and out." },
    ],
    faqs: [
      { question: "Which plans include it?", answer: "Subtitle Remover is available on Pro and Studio." },
      { question: "Does it work with busy backgrounds?", answer: "The captions are blurred rather than redrawn, so over busy backgrounds you'll see a soft patch where the text was. If no text is found, you get your credits back." },
      CREDITS_FAQ,
      COMMERCIAL_FAQ,
    ],
  },

  "ai-brainstormer": {
    h1: "Never open a blank editor again",
    metaTitle: "AI Content Idea Generator for Creators",
    metaDescription:
      "Generate video ideas, hooks, and angles tailored to your niche and format — free, with a daily allowance on every plan.",
    lede: "Describe your niche and get back ideas with hooks and angles written for short-form — not a list of topics you still have to figure out.",
    steps: [
      { title: "Describe your channel", body: "Your niche, your audience, the format you post in." },
      { title: "Generate ideas", body: "You get concepts with hooks and angles, not just single-line titles." },
      { title: "Make one", body: "Take an idea straight into AutoClip or the editor." },
    ],
    benefits: [
      { title: "Hooks, not just topics", body: "A topic is not a video. Each idea comes with an angle and an opening line." },
      { title: "Shaped to your niche", body: "Ideas are grounded in what you actually post about rather than generic advice." },
      { title: "Free to use", body: "No credits — free accounts get 5 runs a day and paid plans 50, enough to make it a habit." },
    ],
    faqs: [
      { question: "How much does it cost?", answer: "Nothing. Free accounts get 5 runs a day and paid plans get 50." },
      { question: "Can I use it for any niche?", answer: "Yes. The more specific your description, the more usable the output." },
      CREDITS_FAQ,
      CANCEL_FAQ,
    ],
  },

  // ----------------------------------------------------------------- free --
  "audio-balancer": {
    h1: "Fix one-sided audio in seconds",
    metaTitle: "Free Audio Balancer — Fix Uneven Stereo",
    metaDescription:
      "Fix audio that plays louder in one ear or only on one side. Free, no credits, no watermark.",
    lede: "Playing loud in one ear, or missing a channel entirely? Upload the file and get both channels back, even. Free, and it costs no credits.",
    steps: [
      { title: "Upload", body: "Add the audio or video file with the uneven channels." },
      { title: "Balance", body: "The channels are evened out, and a one-sided recording is centred across both." },
      { title: "Download", body: "Take the corrected file, no watermark." },
    ],
    benefits: [
      { title: "Free on every plan", body: "Uses no credits, including on the free plan." },
      { title: "Fixes one-sided audio", body: "Recordings that came out entirely on the left or right are recovered to both channels." },
      { title: "Takes video files too", body: "Hand it a video file and you get the corrected audio back as an MP3." },
    ],
    faqs: [
      FREE_TOOL_FAQ,
      { question: "Will it fix audio recorded on only one channel?", answer: "Yes. A single-channel recording is redistributed across both so it plays evenly through headphones and speakers." },
      { question: "Is there a watermark?", answer: "No. Free tools export clean." },
      CANCEL_FAQ,
    ],
  },

  "video-compressor": {
    h1: "Get under the upload limit without looking like it",
    metaTitle: "Free Video Compressor — Reduce File Size Online",
    metaDescription:
      "Compress video to get under an upload limit while keeping it looking good. Free, no credits, no watermark.",
    lede: "Large file slowing you down? Shrink it to share or upload — you choose how much quality to trade for size. Free, and it costs no credits.",
    steps: [
      { title: "Upload your video", body: "Drop in the file you need to make smaller." },
      { title: "Choose size vs quality", body: "Pick how small to go, and optionally a lower resolution for an even smaller file." },
      { title: "Download", body: "Take the smaller file — no watermark, no account tier required." },
    ],
    benefits: [
      { title: "Free on every plan", body: "No credits, on the free plan included." },
      { title: "Five clear levels", body: "From smallest file to best quality, plus resolutions from 1080p down to 240p." },
      { title: "Gets you under the limit", body: "Built for the case where a platform, an email, or a client portal will not accept what you have." },
    ],
    faqs: [
      FREE_TOOL_FAQ,
      { question: "How much smaller can it get?", answer: "It depends on the source. Files straight off a camera or screen recorder usually have the most headroom; already-compressed exports have less." },
      { question: "Which formats are supported?", answer: "All the common ones — MP4, MOV, WebM, and more." },
      CANCEL_FAQ,
    ],
  },

  "mp3-converter": {
    h1: "Pull clean audio out of any file",
    metaTitle: "Free MP3 Converter — Video and Audio to MP3",
    metaDescription:
      "Pull the audio out of a video or convert between audio formats. Free, no credits, no watermark.",
    lede: "Convert a video or any audio format to MP3 at the bitrate you choose, up to 320 kbps. Free, and it costs no credits.",
    steps: [
      { title: "Upload", body: "Add a video or an audio file in any common format." },
      { title: "Convert", body: "The audio is extracted and encoded to MP3." },
      { title: "Download", body: "Take the MP3 — no watermark, no credits spent." },
    ],
    benefits: [
      { title: "Free on every plan", body: "No credits, on the free plan included." },
      { title: "Video in, audio out", body: "Extract the audio from a video without opening an editor." },
      { title: "Feeds the other tools", body: "Convert first, then run it through the Speech Enhancer or the Vocal Remover." },
    ],
    faqs: [
      FREE_TOOL_FAQ,
      { question: "Which input formats work?", answer: "Common video and audio formats — MP4, MOV, WebM, WAV, M4A, FLAC and others." },
      { question: "Is there a watermark?", answer: "No. Free tools export clean." },
      CANCEL_FAQ,
    ],
  },

  "youtube-downloader": {
    h1: "Download a YouTube video, ready to clip",
    metaTitle: "YouTube Video Downloader",
    metaDescription:
      "Paste a YouTube URL and download the video or its audio, ready to clip or edit. One credit per download, no watermark.",
    lede: "Paste a link and get the file at the quality you choose, or just the audio as MP3. One credit per download, no watermark.",
    steps: [
      { title: "Paste the link", body: "Drop in the YouTube URL." },
      { title: "Pick a quality", body: "Choose the resolution you need." },
      { title: "Download", body: "Save the file, then upload it to AutoClip or the editor to start clipping." },
    ],
    benefits: [
      { title: "One credit, refunded on failure", body: "A download that doesn't complete costs nothing." },
      { title: "The first step of a clipping workflow", body: "Downloading is usually step one before AutoClip, and both live in the same account." },
      { title: "Quality you choose", body: "Grab the highest resolution available, or a smaller file if that is all you need." },
    ],
    faqs: [
      { question: "How much does a download cost?", answer: "One credit per download, refunded automatically if it fails. Videos up to 20 minutes." },
      { question: "What am I allowed to download?", answer: "Only content you own or have permission to use. Downloading and reposting someone else's video without rights breaches YouTube's terms and, usually, copyright law — that is on you, not on the tool." },
      { question: "Can I send it straight to AutoClip?", answer: "Save the download, then upload it to AutoClip — or give AutoClip the YouTube link directly." },
      CANCEL_FAQ,
    ],
  },

  "instagram-downloader": {
    h1: "Save Reels and posts at original quality",
    metaTitle: "Instagram Video Downloader — Reels and Posts",
    metaDescription:
      "Download public Instagram Reels, posts, and IGTV videos at the best quality available. One credit per download, no watermark.",
    lede: "Paste a link and download a public Reel, post or IGTV video as the source file rather than a screen capture. One credit per download.",
    steps: [
      { title: "Paste the link", body: "Drop in the Instagram URL for a Reel, post, or IGTV video." },
      { title: "Fetch", body: "The media is pulled at the best quality available." },
      { title: "Download", body: "Save the video, or just its audio as MP3." },
    ],
    benefits: [
      { title: "One credit, refunded on failure", body: "A download that doesn't complete costs nothing." },
      { title: "Original quality", body: "Grabs the source file rather than a re-encoded screen capture." },
      { title: "Reels, posts, and IGTV", body: "One tool for all three formats." },
    ],
    faqs: [
      { question: "How much does a download cost?", answer: "One credit per download, refunded automatically if it fails. Videos up to 20 minutes." },
      { question: "What am I allowed to download?", answer: "Only your own content, or content you have permission to use. Reposting someone else's video without rights breaches Instagram's terms and, usually, copyright law." },
      { question: "Does it work on private accounts?", answer: "No — only publicly accessible posts." },
      CANCEL_FAQ,
    ],
  },
};

export function getToolContent(slug: string): ToolContent | undefined {
  return TOOL_CONTENT[slug];
}

