import { TOOL_SHOT_FILES } from "./shots";

// Marketing copy for the public tool pages at /tools/<slug>.
//
// Kept separate from featureLinks.ts on purpose: that file is the link graph
// (title, in-app href, slug) shared with the dashboard, this one is page copy
// that only the marketing site reads. Same split as app/help/articles.ts and
// app/legal/documents.ts.
//
// Every slug in ALL_TOOLS must have an entry here — see the coverage test in
// app/tools/content.test.ts.

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
  /**
   * Alt text for the two product screenshots in app/tools/shots.ts. Kept here
   * with the rest of the prose so re-capturing the images never overwrites it.
   * Omit for tools that have no shots yet — the page renders without them.
   */
  shotAlt?: { ready: string; result?: string };
}

const CREDITS_FAQ: ToolFaq = {
  question: "How do credits work?",
  answer:
    "Every plan shares one credit balance you can spend on any paid tool. Subscription credits refill each month and roll over up to 2× your monthly allowance; add-on credit packs never expire. Free tools never touch your balance.",
};

const CANCEL_FAQ: ToolFaq = {
  question: "Can I cancel anytime?",
  answer:
    "Yes. Plans are month-to-month with no lock-in, and there is a 48-hour money-back guarantee on every paid plan. You keep access until the end of the period you have already paid for.",
};

const COMMERCIAL_FAQ: ToolFaq = {
  question: "Can I use the output commercially?",
  answer:
    "Yes. Every plan includes a commercial license, so you can monetize what you create on YouTube, TikTok, Instagram, or for client work.",
};

const FREE_TOOL_FAQ: ToolFaq = {
  question: "Is this really free?",
  answer:
    "Yes — this tool runs without spending credits on every plan, including the free one. Create an account and use it as much as you need.",
};

export const TOOL_CONTENT: Record<string, ToolContent> = {
  // ---------------------------------------------------------------- video --
  "video-editor": {
    h1: "Edit video in your browser, no install",
    metaTitle: "Online Video Editor — Multi-Track Timeline",
    metaDescription:
      "Edit video in your browser with a multi-track timeline. Trim, layer, caption, and export in full resolution. No download, no install.",
    lede: "A real multi-track timeline that runs in a browser tab. Cut, layer audio, add captions, and export at full resolution without downloading anything.",
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
    h1: "Turn long videos into viral clips, automatically",
    metaTitle: "AutoClip — Long Video to Short Clips with AI",
    metaDescription:
      "Drop in a podcast, stream, or interview and AutoClip finds the strongest moments, captions them, and cuts them to vertical. Unlimited runs on paid plans.",
    lede: "Drop in a podcast, stream, or interview. AutoClip finds the moments worth posting, captions them, reframes them vertically, and hands you a set of ready-to-upload shorts.",
    steps: [
      { title: "Add your video", body: "Upload a file or paste a link. Paid plans handle uploads from two hours up to six, depending on your plan." },
      { title: "AutoClip finds the moments", body: "It scans the transcript and the audio for self-contained, high-energy segments rather than slicing on a fixed timer." },
      { title: "Review and export", body: "Each clip arrives captioned and reframed to vertical. Keep what works, adjust anything in the editor, and export." },
    ],
    benefits: [
      { title: "Hours become minutes", body: "The slow part of clipping is watching everything back to find the good bits. That is the part AutoClip removes." },
      { title: "Captioned and reframed already", body: "Clips come out vertical with burned-in captions, so they are postable without another pass." },
      { title: "Unlimited on paid plans", body: "No per-clip metering. Run a whole back catalogue through it in an afternoon." },
    ],
    faqs: [
      { question: "How long can the source video be?", answer: "Creator handles uploads up to 2 hours, Pro up to 4, and Studio up to 6. The free plan includes 2 watermarked runs per month." },
      { question: "Can I edit the clips afterwards?", answer: "Yes. Every clip opens in the editor, so you can retime the cut, change the caption style, or swap the crop before exporting." },
      { question: "What source videos work best?", answer: "Anything with clear speech — podcasts, interviews, streams, lectures, reaction videos. Clean audio matters more than resolution." },
      COMMERCIAL_FAQ,
    ],
  },

  "cut-and-crop": {
    h1: "Trim and crop clips ready to post",
    metaTitle: "Cut & Crop — Trim and Reframe Video Online",
    metaDescription:
      "Trim video to the exact moment and crop it to vertical, square, or wide. A fast single-purpose tool for when you already know the cut you want.",
    lede: "For when you already know which ten seconds you want. Set the in and out points, pick your aspect ratio, and export — no timeline to set up.",
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

  "ai-creator": {
    h1: "Become an AI content creator in three steps",
    metaTitle: "AI Creator — Generate Faceless Videos End to End",
    metaDescription:
      "Go from an idea to a finished faceless video: script, voiceover, visuals, and captions generated together in one guided flow.",
    lede: "A guided flow that takes an idea and returns a finished video — script, voiceover, visuals, and captions generated together instead of tool by tool.",
    steps: [
      { title: "Describe the video", body: "Give it a topic, a niche, or a rough idea. It writes a script shaped for short-form pacing." },
      { title: "Pick a voice and a look", body: "Choose a narrator from the voice library and a visual style, then let it generate the imagery and the voiceover." },
      { title: "Publish", body: "Captions are timed to the voiceover automatically. Review the result, tweak anything in the editor, and export." },
    ],
    benefits: [
      { title: "One flow, not five tools", body: "Script, voice, visuals, and captions are produced together and stay in sync, instead of being stitched together by hand." },
      { title: "No camera, no face", body: "Built for faceless channels — everything on screen is generated, so you can publish consistently without filming." },
      { title: "Editable at every step", body: "Rewrite a line, swap a voice, regenerate one image. You are never stuck with the whole output or nothing." },
    ],
    faqs: [
      { question: "Which plans include AI Creator?", answer: "AI Creator is available on Pro and Studio." },
      { question: "Can I use my own script?", answer: "Yes. Paste your own script and skip the generation step — the voiceover, visuals, and captions build from whatever you provide." },
      COMMERCIAL_FAQ,
      CREDITS_FAQ,
    ],
  },

  "reddit-story-videos": {
    h1: "Turn Reddit posts into story videos",
    metaTitle: "Reddit Story Video Generator",
    metaDescription:
      "Paste a Reddit thread and get a narrated story video with synced captions and background footage — formatted for Shorts, Reels, and TikTok.",
    lede: "Paste a thread and get a narrated story video back: post card, AI voiceover, synced captions, and background footage, sized for vertical feeds.",
    steps: [
      { title: "Paste the post", body: "Drop in a Reddit URL or paste the text directly if you would rather write your own." },
      { title: "Choose voice and background", body: "Pick a narrator and the gameplay or ambient footage that runs underneath." },
      { title: "Generate", body: "Captions land in time with the narration and the post card animates in. Export straight to vertical." },
    ],
    benefits: [
      { title: "The whole format, assembled", body: "Post card, narration, captions, and background are produced as one piece instead of four exports you composite yourself." },
      { title: "Built for retention", body: "Caption timing and pacing follow what actually holds attention in the first few seconds of a vertical feed." },
      { title: "Batch a week in one sitting", body: "Each video takes a paste and two choices, so a posting schedule is an afternoon's work." },
    ],
    faqs: [
      { question: "Do I need the Reddit URL?", answer: "No. Pasting the URL is the fast path, but you can type or paste any text and use the same format." },
      { question: "Can I change the background footage?", answer: "Yes — choose from the built-in library or upload your own." },
      COMMERCIAL_FAQ,
      CREDITS_FAQ,
    ],
  },

  "fake-texts-videos": {
    h1: "Make fake text conversation videos",
    metaTitle: "Fake Text Conversation Video Generator",
    metaDescription:
      "Write a chat, pick the participants, and render it as an animated text-message story video with typing indicators, sounds, and narration.",
    lede: "Write the conversation, choose who is texting, and render it as an animated message thread — typing indicators, notification sounds, optional narration.",
    steps: [
      { title: "Write the thread", body: "Type the messages and assign each one to a sender. Set names and avatars to taste." },
      { title: "Set the pacing", body: "Control how fast messages land and where the pauses fall — the timing is what makes the story land." },
      { title: "Render", body: "Export a vertical video with the thread animating in, ready for Shorts, Reels, or TikTok." },
    ],
    benefits: [
      { title: "Looks like a real thread", body: "Typing indicators, read receipts, and notification sounds, so it reads as a screen recording rather than a slideshow." },
      { title: "Pacing you control", body: "The gap before a reply is the whole joke. Set it per message instead of accepting a fixed interval." },
      { title: "Narration optional", body: "Add an AI voiceover reading the thread aloud, or leave it silent and let the captions carry it." },
    ],
    faqs: [
      { question: "Can I add a voiceover?", answer: "Yes. Any voice from the AI Voiceover library can read the thread as it animates." },
      { question: "Can I customise names and avatars?", answer: "Yes — set the display name and avatar for each participant in the thread." },
      COMMERCIAL_FAQ,
      CREDITS_FAQ,
    ],
  },

  "viral-split-screen": {
    h1: "Split-screen videos that hold attention",
    metaTitle: "Viral Split Screen Video Maker",
    metaDescription:
      "Pair your content with satisfying gameplay footage in a vertical split-screen layout — the format built to stop the scroll.",
    lede: "Put your clip on top and satisfying background footage underneath. The layout that keeps people watching a talking-head video to the end.",
    steps: [
      { title: "Add your main clip", body: "Upload the podcast segment, talking head, or story you want to carry the video." },
      { title: "Pick the bottom half", body: "Choose gameplay or ambient footage from the library, or upload your own." },
      { title: "Export vertical", body: "Both halves are framed and synced automatically, with captions burned in if you want them." },
    ],
    benefits: [
      { title: "Retention, engineered", body: "The bottom half gives the eye somewhere to go during slower moments, which is exactly when viewers usually leave." },
      { title: "Framing handled", body: "Both sources are cropped and aligned to the vertical frame automatically — no manual keyframing." },
      { title: "Captions included", body: "Burn in synced captions so the video works with the sound off." },
    ],
    faqs: [
      { question: "Can I use my own background footage?", answer: "Yes. Upload anything you like, or use the built-in gameplay and ambient library." },
      { question: "Which half gets the audio?", answer: "Your main clip carries the audio by default. The background plays silently, and you can mix in music if you want." },
      COMMERCIAL_FAQ,
      CREDITS_FAQ,
    ],
  },

  // ------------------------------------------------------------------- ai --
  "ai-image-generator": {
    h1: "Generate high-quality AI images in seconds",
    metaTitle: "AI Image Generator — Nine Models, One Balance",
    metaDescription:
      "Generate images with Flux 2, Seedream 5.0, GPT Image 2, Ideogram 4, Nano Banana Pro, and more — all from one credit balance, no separate subscriptions.",
    lede: "Nine image models behind one prompt box and one credit balance — Flux 2, Seedream 5.0, GPT Image 2, Ideogram 4, Nano Banana Pro and more, without a separate subscription for each.",
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
      { question: "Which models are available?", answer: "Gemini Flash 2.0, Seedream 5.0, GPT Image 2, Flux 2, Nano Banana 2, Ideogram 4, Krea 2, and Qwen Image 2.0. Nano Banana Pro is Studio-only." },
      { question: "How many credits does an image cost?", answer: "It depends on the model — cheaper models cost less per image. The pricing page lists the cost of every model, and the credit calculator estimates a monthly total from your expected usage." },
      COMMERCIAL_FAQ,
      CREDITS_FAQ,
    ],
    shotAlt: {
      ready: "The Clipiro image generator with the model, aspect ratio and prompt controls ready for a first generation.",
      result: "The same screen with a prompt written and a grid of previously generated images in the panel alongside.",
    },
  },

  "ai-voiceover": {
    h1: "Generate lifelike AI voiceovers",
    metaTitle: "AI Voiceover Generator — 50+ Narrators",
    metaDescription:
      "Turn a script into a natural-sounding voiceover with 50+ narrators across multiple languages. Captions sync automatically.",
    lede: "Paste a script, pick from more than fifty narrators, and get a natural-sounding voiceover back in seconds — with captions already timed to it.",
    steps: [
      { title: "Paste your script", body: "Type or paste the text. Punctuation shapes the delivery, so commas and full stops are worth getting right." },
      { title: "Choose a narrator", body: "Browse fifty-plus voices across accents and languages, and preview any of them before you spend a credit." },
      { title: "Generate", body: "Download the audio or send it straight to the editor, where captions can be generated in sync with it." },
    ],
    benefits: [
      { title: "Fifty-plus voices", body: "Enough range to give different channels and formats their own identity instead of reusing one recognisable narrator." },
      { title: "Captions that match", body: "Because the timing comes from the generated audio, captions land on the word rather than near it." },
      { title: "Multiple languages", body: "Narrate in several languages to take the same script to a different audience." },
    ],
    faqs: [
      { question: "How many voices are there?", answer: "Over fifty narrators, spanning a range of accents and several languages. You can preview any voice before generating." },
      { question: "Can I generate in other languages?", answer: "Yes — multiple languages are supported, with narrators suited to each." },
      COMMERCIAL_FAQ,
      CREDITS_FAQ,
    ],
    shotAlt: {
      ready: "The Clipiro voiceover generator with a narrator selected and an empty script box ready for text.",
      result: "The same screen with a script written and two finished voiceovers listed, each with a play button and duration.",
    },
  },

  "ai-video-generator": {
    h1: "Generate AI video from a prompt",
    metaTitle: "AI Video Generator — Veo 3, Seedance 2.0 and More",
    metaDescription:
      "Generate video from a text prompt or a still image with Veo 3, Seedance 2.0, Wan 2.7, LTX 2.3 and more — up to 15 seconds per clip.",
    lede: "Describe a shot and get video back. Sixteen models including Google's Veo 3 and Seedance 2.0, generating clips up to fifteen seconds.",
    steps: [
      { title: "Describe the shot", body: "Write what should happen, or start from a still image and animate it." },
      { title: "Choose a model and length", body: "Creator generates up to 8 seconds, Pro up to 12, Studio up to 15 — pick the model that suits the look you want." },
      { title: "Generate", body: "The clip lands in your asset library, ready to cut into a longer edit or post on its own." },
    ],
    benefits: [
      { title: "The frontier models, included", body: "Veo 3 and Seedance 2.0 sit on Pro and above, alongside Wan 2.7 and LTX 2.3 on Creator — no separate subscriptions." },
      { title: "Text or image to video", body: "Start from a written prompt, or bring a still and animate it." },
      { title: "Cut it into real edits", body: "Generated clips drop onto the editor timeline like any other footage." },
    ],
    faqs: [
      { question: "How long can generated videos be?", answer: "Up to 8 seconds on Creator, 12 on Pro, and 15 on Studio. Longer pieces are built by generating several clips and cutting them together in the editor." },
      { question: "Which models need a paid plan?", answer: "Creator includes nine models, among them Wan 2.7 and LTX 2.3. Pro adds Veo 3, Seedance 2.0, and five others, for sixteen in total." },
      COMMERCIAL_FAQ,
      CREDITS_FAQ,
    ],
  },

  "ai-face-swap": {
    h1: "Swap faces in photos and videos",
    metaTitle: "AI Face Swap for Photos and Video",
    metaDescription:
      "Swap a face into a photo or a video clip with AI. Tracks across frames and matches lighting so the result holds up in motion.",
    lede: "Put one face onto another in a photo or a video clip. The swap tracks across frames and matches lighting, so it holds together in motion rather than just in a single still.",
    steps: [
      { title: "Upload the target", body: "Add the photo or video clip you want to change." },
      { title: "Add the face", body: "Upload a clear, well-lit reference of the face to swap in. Front-facing works best." },
      { title: "Generate", body: "The swap is applied across every frame and the result saves to your asset library." },
    ],
    benefits: [
      { title: "Video, not just stills", body: "The face is tracked frame to frame, so it stays locked as the head turns." },
      { title: "Lighting matched", body: "The swapped face is relit to the target scene, which is what usually gives a bad swap away." },
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
    h1: "Remove backgrounds from images and video",
    metaTitle: "AI Background Remover for Images and Video",
    metaDescription:
      "Cut the background out of a photo or a video clip automatically — clean edges around hair and motion, transparent output ready to composite.",
    lede: "Cut the background out of a photo or a video clip in one pass, with edges clean enough to composite straight onto something else.",
    steps: [
      { title: "Upload", body: "Add an image or a video clip — the same tool handles both." },
      { title: "Let it cut", body: "The subject is detected and separated automatically. No manual masking or green screen needed." },
      { title: "Export", body: "Download with a transparent background, or drop it onto a new background in the editor." },
    ],
    benefits: [
      { title: "Video as well as stills", body: "Most background removers stop at images. This one tracks the subject across a whole clip." },
      { title: "Holds up on hair and motion", body: "The edges that usually betray a cutout — hair, fast movement — are where the model does its most careful work." },
      { title: "No green screen", body: "Shoot against whatever wall you have and remove it afterwards." },
    ],
    faqs: [
      { question: "Does it work on video?", answer: "Yes — images and video clips both, with the subject tracked across frames." },
      { question: "What format is the output?", answer: "Transparent PNG for images and a transparent-capable video format for clips, so you can composite them onto a new background." },
      CREDITS_FAQ,
      COMMERCIAL_FAQ,
    ],
  },

  "ai-voice-changer": {
    h1: "Change any voice with AI",
    metaTitle: "AI Voice Changer — Transform Recorded Audio",
    metaDescription:
      "Convert a recording into a different voice while keeping your original delivery, timing, and emotion intact.",
    lede: "Record it in your own voice, then change whose voice it is. Your timing, emphasis, and delivery survive the conversion — only the voice changes.",
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
    h1: "Strip vocals from audio or video",
    metaTitle: "AI Vocal Remover — Separate Vocals and Instrumental",
    metaDescription:
      "Split a track into clean vocal and instrumental stems with AI. Works on audio files and on the audio inside a video.",
    lede: "Separate a track into vocals and instrumental. Take the backing track for a cover, or lift a clean acapella out of a finished mix.",
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
    h1: "Clean up and enhance any audio",
    metaTitle: "AI Speech Enhancer — Remove Noise, Improve Clarity",
    metaDescription:
      "Strip background noise, room echo, and hiss from a recording and bring the voice forward — rescue audio recorded in a bad room.",
    lede: "Take a recording made in a bad room and make it sound deliberate. Background noise, echo, and hiss come out; the voice comes forward.",
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
      { question: "Does it work on video files?", answer: "Yes. Upload the video and the enhanced audio is applied to it." },
      CREDITS_FAQ,
      COMMERCIAL_FAQ,
    ],
  },

  "subtitle-remover": {
    h1: "Remove burned-in subtitles from video",
    metaTitle: "AI Subtitle Remover — Erase Hardcoded Captions",
    metaDescription:
      "Erase hardcoded subtitles from a video with AI inpainting that reconstructs what was behind them, so you can recaption in your own style.",
    lede: "Erase captions that were burned into the footage. The model reconstructs what was behind them, so you can recaption in your own style instead of stacking text on text.",
    steps: [
      { title: "Upload the video", body: "Add the clip with the burned-in subtitles." },
      { title: "Mark the caption area", body: "Indicate where the text sits. Most videos keep captions in one consistent band." },
      { title: "Remove", body: "The area is inpainted frame by frame and the cleaned video saves to your library." },
    ],
    benefits: [
      { title: "Reconstructs, not blurs", body: "Rather than covering the text with a bar, it rebuilds the image underneath." },
      { title: "Recaption in your own style", body: "Repurpose footage that arrived captioned without ending up with two competing sets of text." },
      { title: "Frame-accurate", body: "Applied across every frame, so the removal does not flicker in and out." },
    ],
    faqs: [
      { question: "Which plans include it?", answer: "Subtitle Remover is available on Pro and Studio." },
      { question: "Does it work with busy backgrounds?", answer: "Yes, though results are strongest over simpler areas. Text sitting over fine, fast-moving detail is the hardest case." },
      CREDITS_FAQ,
      COMMERCIAL_FAQ,
    ],
  },

  "ai-brainstormer": {
    h1: "Get viral content ideas for your niche",
    metaTitle: "AI Content Idea Generator for Creators",
    metaDescription:
      "Generate video ideas, hooks, and angles tailored to your niche and format — costs 1 credit per run.",
    lede: "Describe your niche and get back ideas, hooks, and angles shaped for short-form — so the blank page is somebody else's problem.",
    steps: [
      { title: "Describe your channel", body: "Your niche, your audience, the format you post in." },
      { title: "Generate ideas", body: "You get concepts with hooks and angles, not just single-line titles." },
      { title: "Make one", body: "Take an idea straight into AutoClip, AI Creator, or the editor." },
    ],
    benefits: [
      { title: "Hooks, not just topics", body: "A topic is not a video. Each idea comes with an angle and an opening line." },
      { title: "Shaped to your niche", body: "Ideas are grounded in what you actually post about rather than generic advice." },
      { title: "One credit a run", body: "Cheap enough to use as a habit whenever you sit down to plan." },
    ],
    faqs: [
      { question: "How much does it cost?", answer: "One credit per run." },
      { question: "Can I use it for any niche?", answer: "Yes. The more specific your description, the more usable the output." },
      CREDITS_FAQ,
      CANCEL_FAQ,
    ],
    shotAlt: {
      ready: "The Clipiro brainstormer with topic, tone, audience and video-type fields waiting to be filled in.",
      result: "The same screen after generating, listing five numbered video ideas each with a one-line angle.",
    },
  },

  // ----------------------------------------------------------------- free --
  "audio-balancer": {
    h1: "Balance left and right audio channels",
    metaTitle: "Free Audio Balancer — Fix Uneven Stereo",
    metaDescription:
      "Fix audio that plays louder in one ear or only on one side. Free, no credits, no watermark.",
    lede: "Fix a recording that plays louder in one ear, or one that ended up entirely on a single channel. Free, and it costs no credits.",
    steps: [
      { title: "Upload", body: "Add the audio or video file with the uneven channels." },
      { title: "Balance", body: "The channels are evened out, and a one-sided recording is centred across both." },
      { title: "Download", body: "Take the corrected file, no watermark." },
    ],
    benefits: [
      { title: "Free on every plan", body: "Uses no credits, including on the free plan." },
      { title: "Fixes one-sided audio", body: "Recordings that came out entirely on the left or right are recovered to both channels." },
      { title: "Works on video too", body: "Hand it a video file and the corrected audio is applied back to it." },
    ],
    faqs: [
      FREE_TOOL_FAQ,
      { question: "Will it fix audio recorded on only one channel?", answer: "Yes. A single-channel recording is redistributed across both so it plays evenly through headphones and speakers." },
      { question: "Is there a watermark?", answer: "No. Free tools export clean." },
      CANCEL_FAQ,
    ],
  },

  "video-compressor": {
    h1: "Shrink video size without losing quality",
    metaTitle: "Free Video Compressor — Reduce File Size Online",
    metaDescription:
      "Compress video to get under an upload limit while keeping it looking good. Free, no credits, no watermark.",
    lede: "Get a file under an upload limit without it looking like it. Free, and it costs no credits.",
    steps: [
      { title: "Upload your video", body: "Drop in the file you need to make smaller." },
      { title: "Choose how hard to compress", body: "Trade size against quality, with a preview of the result before you commit." },
      { title: "Download", body: "Take the smaller file — no watermark, no account tier required." },
    ],
    benefits: [
      { title: "Free on every plan", body: "No credits, on the free plan included." },
      { title: "Quality-aware", body: "Compresses to a target size while protecting detail, rather than uniformly degrading the whole file." },
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
    h1: "Convert any media file to MP3",
    metaTitle: "Free MP3 Converter — Video and Audio to MP3",
    metaDescription:
      "Pull the audio out of a video or convert between audio formats. Free, no credits, no watermark.",
    lede: "Pull the audio out of a video, or convert between audio formats. Free, and it costs no credits.",
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
    // One shot only: conversion runs locally through FFmpeg on a file the
    // capture cannot supply, so there is no second state to photograph.
    shotAlt: {
      ready: "The Clipiro MP3 converter with its drop zone ready to accept a video or audio file.",
    },
  },

  "youtube-downloader": {
    h1: "Download YouTube videos in a click",
    metaTitle: "Free YouTube Video Downloader",
    metaDescription:
      "Paste a YouTube URL and download the video, ready to clip or edit. Free, no credits, no watermark.",
    lede: "Paste a URL and get the file — ready to run through AutoClip or drop onto the editor timeline. Free, and it costs no credits.",
    steps: [
      { title: "Paste the link", body: "Drop in the YouTube URL." },
      { title: "Pick a quality", body: "Choose the resolution you need." },
      { title: "Download", body: "Save the file, or send it straight into AutoClip to start clipping." },
    ],
    benefits: [
      { title: "Free on every plan", body: "No credits, on the free plan included." },
      { title: "The first step of a clipping workflow", body: "Downloading is usually step one before AutoClip. Doing both in one place saves a round trip." },
      { title: "Quality you choose", body: "Grab the highest resolution available, or a smaller file if that is all you need." },
    ],
    faqs: [
      FREE_TOOL_FAQ,
      { question: "What am I allowed to download?", answer: "Only content you own or have permission to use. Downloading and reposting someone else's video without rights breaches YouTube's terms and, usually, copyright law — that is on you, not on the tool." },
      { question: "Can I send it straight to AutoClip?", answer: "Yes. Downloads land in your asset library, so any tool can pick them up." },
      CANCEL_FAQ,
    ],
  },

  "instagram-downloader": {
    h1: "Save Reels, posts, and IGTV",
    metaTitle: "Free Instagram Video Downloader — Reels and Posts",
    metaDescription:
      "Download Instagram Reels, posts, and IGTV videos in their original quality. Free, no credits, no watermark.",
    lede: "Download Reels, posts, and IGTV in their original quality, ready to edit or repurpose. Free, and it costs no credits.",
    steps: [
      { title: "Paste the link", body: "Drop in the Instagram URL for a Reel, post, or IGTV video." },
      { title: "Fetch", body: "The media is pulled at the best quality available." },
      { title: "Download", body: "Save it, or take it straight into the editor." },
    ],
    benefits: [
      { title: "Free on every plan", body: "No credits, on the free plan included." },
      { title: "Original quality", body: "Grabs the source file rather than a re-encoded screen capture." },
      { title: "Reels, posts, and IGTV", body: "One tool for all three formats." },
    ],
    faqs: [
      FREE_TOOL_FAQ,
      { question: "What am I allowed to download?", answer: "Only your own content, or content you have permission to use. Reposting someone else's video without rights breaches Instagram's terms and, usually, copyright law." },
      { question: "Does it work on private accounts?", answer: "No — only publicly accessible posts." },
      CANCEL_FAQ,
    ],
  },
};

export function getToolContent(slug: string): ToolContent | undefined {
  return TOOL_CONTENT[slug];
}

export interface ResolvedShot {
  src: string;
  alt: string;
  width: number;
  height: number;
  blurDataURL: string;
}

/**
 * Joins the generated file data in shots.ts to the hand-written alt text here.
 * A shot only counts as usable when both halves exist — a screenshot with no
 * alt text is not something to ship, so it is dropped rather than rendered
 * with a placeholder.
 */
export function getToolShots(slug: string): { ready?: ResolvedShot; result?: ResolvedShot } {
  const files = TOOL_SHOT_FILES[slug];
  const alt = TOOL_CONTENT[slug]?.shotAlt;
  if (!files || !alt) return {};

  return {
    ready: files.ready && alt.ready ? { ...files.ready, alt: alt.ready } : undefined,
    result: files.result && alt.result ? { ...files.result, alt: alt.result } : undefined,
  };
}
