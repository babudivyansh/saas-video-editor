// Designed illustrations for the tool pages, where one exists.
//
// The inline-SVG motifs in components/marketing/toolMotifs.tsx remain the
// default and cover all 22 tools. A slug listed here renders its artwork
// instead — the opt-in path for tools that have had a real piece designed.
//
// Only the illustration is ever baked into the file. Headline, subhead and CTA
// stay as live HTML: these pages exist to rank, and an <h1> made of pixels
// ranks for nothing.

export interface ToolImageFile {
  src: string;
  alt: string;
  width: number;
  height: number;
  /** Tiny inline WebP shown by next/image while the full file loads. */
  blurDataURL: string;
}

export interface ToolImageSet {
  primary: ToolImageFile;
  /** Rendered directly beneath the first, still inside the hero. */
  secondary?: ToolImageFile;
}

export const TOOL_IMAGES: Record<string, ToolImageSet> = {
  "auto-clip": {
    primary: {
      src: "/tools/auto-clip-hero.webp",
      alt: "One long podcast recording in a player, with three vertical short clips branching off it, each captioned.",
      width: 1421,
      height: 1290,
      blurDataURL:
        "data:image/webp;base64,UklGRoYAAABXRUJQVlA4IHoAAADwAQCdASoQAA8AA4BaJZwAD48QkXFNOgAA/rgOVh52PsrSlyXtLbR0tcDzUFLy5o58nG2Be6ESOjuBq1tucdkgBsnpcHqP103gyK38hlXcvHbZ1u/j+7x0ePpAe3M6V2AUMqnTMYIeytWCP30EZB2cXNQxIqDdwBAAAA==",
    },
    secondary: {
      src: "/tools/auto-clip-workflow.webp",
      alt: "The three steps in order: upload a long video, AI marks the highlights on a timeline, and finished vertical clips come out.",
      width: 1790,
      height: 1060,
      blurDataURL:
        "data:image/webp;base64,UklGRloAAABXRUJQVlA4IE4AAACwAQCdASoQAAkAA4BaJZwAAsYh7XiYAP5rYFoaSVL+Ky5rBXHvuXMCXdx8WNJ5mbryW2Y8BLHnJ8xCLtOA2p5dwMizLSJs3m6DOU3oUAA=",
    },
  },
  "viral-split-screen": {
    primary: {
      src: "/tools/viral-split-screen-hero.webp",
      alt: "Split-screen editor with two video source thumbnails, drag-and-drop media cards, alignment controls, a stacked vertical preview of two speakers, and an export timeline.",
      width: 1800,
      height: 982,
      blurDataURL:
        "data:image/webp;base64,UklGRkgAAABXRUJQVlA4IDwAAADQAQCdASoQAAkAA4BaJZwAAu19w0e6AAD++LoiTisNp1CbIEyxnySc2DAEO9Jaoem4+UabPswhSP2AAAA=",
    },
  },
  "reddit-story-videos": {
    primary: {
      src: "/tools/reddit-story-videos-hero-v2.webp",
      alt: "A Reddit post's script fed into an AI script generator, producing a captioned vertical video with subway-surfers-style background gameplay.",
      width: 1354,
      height: 1161,
      blurDataURL:
        "data:image/webp;base64,UklGRmgAAABXRUJQVlA4IFwAAADwAQCdASoQAA4AA4BaJYwCw7EUIP62GoAA/vCkiGJNCcHY/4xhMB8+l2+Qxh5juH0dqSMPF9mvnP/WxJv/J66GRI1pqqsgmZksP2Z9QhhD+co2M2ruQM1X68CAAA==",
    },
    secondary: {
      src: "/tools/reddit-story-videos-workflow.webp",
      alt: "Three steps: enter a Reddit post script, select an AI voice for the clip, and choose a subtitle style and animation.",
      width: 1800,
      height: 600,
      blurDataURL:
        "data:image/webp;base64,UklGRigAAABXRUJQVlA4IBwAAAAwAQCdASoQAAUAA4BaJaQAA3AA/vSsUyjgjQAA",
    },
  },
  "fake-texts-videos": {
    primary: {
      src: "/tools/fake-texts-videos-hero.webp",
      alt: "Three fake text-message conversation videos, each styled over a different background: a snowy game scene, a park scene, and a dark chat wallpaper, all captioned.",
      width: 1254,
      height: 1254,
      blurDataURL:
        "data:image/webp;base64,UklGRpIAAABXRUJQVlA4IIYAAAAwAgCdASoQABAAA4BaJbACdAYvhkd6knF1AAD+8I4Mn21z7fRVHGn9fwQzzqSUcbhwhzarq9Mx5/0VgD5GyWHKy1/ypd7sh0nLbUy9VkHtuGjSweoyO3NbehQ4DfTt6cnTRQGYKktfj980Gsd58og/ExAF3b1exO9N/TymMBg+5AEoQr2QAA==",
    },
    secondary: {
      src: "/tools/fake-texts-videos-workflow.webp",
      alt: "Three steps: write the chat script and select a theme, select an AI voiceover for the clip, and select from a wide range of gameplay videos.",
      width: 1421,
      height: 492,
      blurDataURL:
        "data:image/webp;base64,UklGRkYAAABXRUJQVlA4IDoAAACwAQCdASoQAAYAA4BaJZwAAucJkWd8AP72aDLu1qGzOlaGp2tFkIxKd/kambgdTdWZ95vMAAASVwgA",
    },
  },
  "audio-balancer": {
    primary: {
      src: "/tools/audio-balancer-hero.webp",
      alt: "Audio balance editor showing before-and-after waveforms for left and right channels, with an AI analysis panel detecting uneven levels and normalizing loudness.",
      width: 1600,
      height: 900,
      blurDataURL:
        "data:image/webp;base64,UklGRiwAAABXRUJQVlA4ICAAAAAwAQCdASoQAAkAA4BaJaQAA3AA/vQ42ArAKfLQ/PIAAA==",
    },
  },
  "video-compressor": {
    primary: {
      src: "/tools/video-compressor-hero.webp",
      alt: "A 250 MB file shrinking down to 25 MB after compression.",
      width: 376,
      height: 179,
      blurDataURL:
        "data:image/webp;base64,UklGRnAAAABXRUJQVlA4IGQAAAAwAgCdASoQAAgAA4BaJZACdG1/DxftqYHp6AD+8Kb/Y53+xfTZjZIP59q/Udcl4K4x9M+FU2PzPun7RqSK09AGDEsb7y4tQLi37SgwQ3L+a6jaLGXLAEwJlboQttzoiTOFgAAA",
    },
  },
  "mp3-converter": {
    primary: {
      src: "/tools/mp3-converter-hero.webp",
      alt: "A video file converting into an MP3 file.",
      width: 393,
      height: 168,
      blurDataURL:
        "data:image/webp;base64,UklGRmYAAABXRUJQVlA4IFoAAABQAgCdASoQAAcAA4BaJQBOgMUA3K/X6i391AAA/u5bRu0rOoyKVOqN0NoTEurF04H1BN41RWVRoNlX0rRcg8Tup0lict7aIo7LhGkge1vTh7aCObWNW0K4AAA=",
    },
  },
  "youtube-downloader": {
    primary: {
      src: "/tools/youtube-downloader-hero.webp",
      alt: "Four-step YouTube downloader flow: paste a link, fetch the video, choose quality and format, then download with a live progress ring.",
      width: 1394,
      height: 775,
      blurDataURL:
        "data:image/webp;base64,UklGRlwAAABXRUJQVlA4IFAAAAAQAgCdASoQAAkAA4BaJZwAD43tZzbph9TgAP71ByvkKCb9LCjQtELwciUUj9ltTBkuKGRmjDMLluqhTQ3G8WpupGHibessm7xZAnuAVYAAAA==",
    },
  },
  "ai-image-generator": {
    primary: {
      src: "/tools/ai-image-generator-hero.webp",
      alt: "A text prompt for a small, adorable cat with bright green eyes, generating four matching cat photos.",
      width: 581,
      height: 507,
      blurDataURL:
        "data:image/webp;base64,UklGRkIAAABXRUJQVlA4IDYAAADQAQCdASoQAA4AA4BaJZwAAudehB0MAAD+9+R+S9E0H3RbQfpuM5v2y1n9Iv8Eb1uRFq8kgAA=",
    },
    secondary: {
      src: "/tools/ai-image-generator-workflow.webp",
      alt: "Three steps: write your prompt or use a preset, let AI do the magic, and select from the options and download.",
      width: 1399,
      height: 411,
      blurDataURL:
        "data:image/webp;base64,UklGRjIAAABXRUJQVlA4ICYAAACQAQCdASoQAAUAA4BaJaQAAudFrAAA/vcLafgiszHAK6DHwAAAAA==",
    },
  },
  "ai-voice-changer": {
    primary: {
      src: "/tools/ai-voice-changer-hero.webp",
      alt: "An original voice recording transformed into a new AI voice, choosing from narrator options like Adam, Sofia, Lucas, Emma, and Noah.",
      width: 1600,
      height: 900,
      blurDataURL:
        "data:image/webp;base64,UklGRjIAAABXRUJQVlA4ICYAAAAwAQCdASoQAAkAA4BaJaQAA3AA/vRGcizTtdfLJj/i8+spoMAAAA==",
    },
  },
  "ai-voiceover": {
    primary: {
      src: "/tools/ai-voiceover-hero.webp",
      alt: "A typed script turning into a voiceover, with narrator options like James Brown, Bill, and Dan Dan to choose from.",
      width: 637,
      height: 559,
      blurDataURL:
        "data:image/webp;base64,UklGRiwAAABXRUJQVlA4ICAAAAAwAQCdASoQAA4AA4BaJaQAA3AA/vSsZEWXJaSfRVAAAA==",
    },
    secondary: {
      src: "/tools/ai-voiceover-workflow.webp",
      alt: "Three steps: paste your script, choose a voice and style, and generate and download the voiceover.",
      width: 1416,
      height: 416,
      blurDataURL:
        "data:image/webp;base64,UklGRiwAAABXRUJQVlA4ICAAAAAwAQCdASoQAAUAA4BaJaQAA3AA/vQ2QbI1RJw0mUAAAA==",
    },
  },
  "ai-face-swap": {
    primary: {
      src: "/tools/ai-face-swap-hero.webp",
      alt: "A face swap tool showing a source photo swapped into a result photo.",
      width: 582,
      height: 526,
      blurDataURL:
        "data:image/webp;base64,UklGRl4AAABXRUJQVlA4IFIAAAAQAgCdASoQAA4AA4BaJZgC7AEUo1bbgOwAAP737Ky5sepGDcebAF8m2nAvjIutYvir/kbUVwz5KCTKJ/aopysECDIpmyqiDyd0BkM5g4uigAAA",
    },
  },
  "ai-speech-enhancer": {
    primary: {
      src: "/tools/ai-speech-enhancer-hero.webp",
      alt: "A noisy audio waveform being cleaned up into a clear speech waveform.",
      width: 538,
      height: 448,
      blurDataURL:
        "data:image/webp;base64,UklGRkgAAABXRUJQVlA4IDwAAADQAQCdASoQAA0AA4BaJQBOgCFsgbXMwAD+9+7jf5KSz8dO/eqG7Ib+XFRdbJevC//jYH5nlca+ga9gAAA=",
    },
    secondary: {
      src: "/tools/ai-speech-enhancer-workflow.webp",
      alt: "Three steps: upload your audio, AI enhances your voice, and preview and download.",
      width: 1372,
      height: 403,
      blurDataURL:
        "data:image/webp;base64,UklGRjYAAABXRUJQVlA4ICoAAACwAQCdASoQAAUAA4BaJZwAAudGNfQAAP73BtMg9+Bl3aiXkX23c84QAAA=",
    },
  },
  "cut-and-crop": {
    primary: {
      src: "/tools/cut-and-crop-hero.webp",
      alt: "A 16:9 video with a subject-tracked crop region marked out, previewed alongside its AI-smart-cropped 9:16 output, with a frame-perfect cut timeline below.",
      width: 1467,
      height: 830,
      blurDataURL:
        "data:image/webp;base64,UklGRlgAAABXRUJQVlA4IEwAAADwAQCdASoQAAkAA4BaJZwAD4zNVOTkdwAA+PubQc5+vOVSnWhlUtNnug3xVL01BoTPeMpDR7OYy2VziA/irdi44FmstqskCOJK5HAA",
    },
  },
  "subtitle-remover": {
    primary: {
      src: "/tools/subtitle-remover-hero.webp",
      alt: "A video frame with burned-in subtitles on one side and the same frame cleaned up on the other, with a progress bar removing subtitles.",
      width: 1254,
      height: 1254,
      blurDataURL:
        "data:image/webp;base64,UklGRmIAAABXRUJQVlA4IFYAAACwAQCdASoQABAAA4BaJZwAAodlEJAAAP72JUcnVbPIH2uU/6nYyhXFuKiJgfCCKBRASrr1LdPl8Xt+Y2J6CRxvCAnW1ric+GMngdHoQ5A54S/ixs0AAA==",
    },
  },
  "background-remover": {
    primary: {
      src: "/tools/background-remover-hero.webp",
      alt: "A video frame split into before and after, with the background removed on the right side down to a transparent checkerboard.",
      width: 546,
      height: 513,
      blurDataURL:
        "data:image/webp;base64,UklGRlYAAABXRUJQVlA4IEoAAAAwAgCdASoQAA8AA4BaJZwC7AYrdvoWyj3YAAD+9+bT+nOyiiirX0aWIZhFN/xspan2kLzpqmk7w/ZGUaz9bA6qtOhRmuM8ocZgAA==",
    },
    secondary: {
      src: "/tools/background-remover-workflow.webp",
      alt: "Three steps: upload your image or video, AI auto-cleans your background, and preview and download.",
      width: 1396,
      height: 420,
      blurDataURL:
        "data:image/webp;base64,UklGRkYAAABXRUJQVlA4IDoAAACQAQCdASoQAAUAA4BaJaQAAse4kYAA/vYkgmZJJBn4/uUtOmfjD5PEumxdIQQbOve2G9651jZSAAAA",
    },
  },
  "ai-creator": {
    primary: {
      src: "/tools/ai-creator-hero.webp",
      alt: "An original video next to avatar, voiceover, language, background, and aspect ratio pickers for generating an AI creator video.",
      width: 1348,
      height: 896,
      blurDataURL:
        "data:image/webp;base64,UklGRlwAAABXRUJQVlA4IFAAAADwAQCdASoQAAsAA4BaJZwAD48MYU6xyAAA/rez8Z7mbD74z7vGaTU2I+5jzZHosBnGcVB4k32h836DzzgEvoUB/kuQ9Ts3TUTQqLgtbRwAAA==",
    },
  },
  "ai-video-generator": {
    primary: {
      src: "/tools/ai-video-generator-hero.webp",
      alt: "A prompt describing a couple hiking at sunrise, generating a video with model, duration, and aspect ratio controls, previewed with its four generated scenes.",
      width: 1352,
      height: 683,
      blurDataURL:
        "data:image/webp;base64,UklGRlQAAABXRUJQVlA4IEgAAADQAQCdASoQAAgAA4BaJYwC7AD2O5JEAAD+9/Dt9Tzx2xrFTtJqd1Eh/YLXEUfCx6mzToE0WTv62yUZy5PvvxXMK3QvisgAAAA=",
    },
  },
  "ai-vocal-remover": {
    primary: {
      src: "/tools/ai-vocal-remover-hero.webp",
      alt: "An uploaded audio track being separated by AI into a removed vocal track and a clean instrumental track, ready to export.",
      width: 1439,
      height: 804,
      blurDataURL:
        "data:image/webp;base64,UklGRkIAAABXRUJQVlA4IDYAAACQAQCdASoQAAkAA4BaJZQAApJqu8AA/vcRYvSRTPJ73rU3YJnrRzZyM7ZNuut73Eb3GcMAAAA=",
    },
  },
  "ai-brainstormer": {
    primary: {
      src: "/tools/ai-brainstormer-hero.webp",
      alt: "A topic, tone, audience, and video-type form generating a list of content ideas like video titles, hooks, and tags.",
      width: 1536,
      height: 1024,
      blurDataURL:
        "data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACwAQCdASoQAAsAA4BaJZQAAuQmZS8AAP73CRxkhWWdYHYsYv0Fh8wmjglxgQAA",
    },
  },
  "instagram-downloader": {
    primary: {
      src: "/tools/instagram-downloader-hero.webp",
      alt: "Four-step Instagram downloader flow: paste a link, preview the fetched video, choose quality and format, then download with a live progress ring.",
      width: 1600,
      height: 664,
      blurDataURL:
        "data:image/webp;base64,UklGRkIAAABXRUJQVlA4IDYAAACQAQCdASoQAAcAA4BaJZwAAlpbkgAA/vT1oQb6VdvtFlse+Zx93GBVbbMAIz1TbCIqEoAAAAA=",
    },
  },
};

export function getToolImages(slug: string): ToolImageSet | undefined {
  return TOOL_IMAGES[slug];
}
