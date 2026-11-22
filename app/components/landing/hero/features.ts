// The hero carousel's content, in one table: which panels exist, what they
// link to, and which demo media they play. Swapping footage (e.g. for real
// AutoClip output later) is an edit here plus new files in public/hero/demo.
//
// All footage is CC BY on YouTube; the credit line under the hero
// (HERO_FOOTAGE_CREDIT) is what that license asks for, so keep it in step
// with the footage. scripts/build-hero-clipping-media.sh cuts the AI clipping
// rounds; scripts/build-hero-demo-media.sh cuts the other panels' files.

export type FeatureId = "clipping" | "captions" | "reframe" | "broll" | "speech" | "voiceover";

export interface HeroFeature {
  id: FeatureId;
  /** Tab label. */
  label: string;
  /** One line under the stage, read out when the panel changes. */
  blurb: string;
  /** The public page that explains the real tool. */
  href: string;
}

/** One round of the AI clipping panel: click, drop, spread, hold. */
export const CLIP_ROUND_MS = 4000;

/** How long autoplay stays on a panel. Clipping shows every round once. */
export const DWELL_MS: Record<FeatureId, number> = {
  clipping: CLIP_ROUND_MS * 5,
  captions: 1800 * 7,
  reframe: 9000,
  broll: 9000,
  speech: 9000,
  voiceover: 9000,
};

export const HERO_FEATURES: HeroFeature[] = [
  { id: "clipping", label: "AI clipping", blurb: "One long video in, a stack of ready-to-post shorts out.", href: "/tools/auto-clip" },
  { id: "captions", label: "AI captioning", blurb: "Word-by-word animated captions, in 150 styles.", href: "/caption-templates" },
  { id: "reframe", label: "AI reframe", blurb: "Landscape to vertical: gameplay and facecam stacked into one Short.", href: "/tools/auto-clip" },
  { id: "broll", label: "AI B-roll", blurb: "Cutaways dropped in where the story needs them.", href: "/tools/auto-clip" },
  { id: "speech", label: "AI speech enhance", blurb: "Background noise out, voices clear.", href: "/tools/ai-speech-enhancer" },
  { id: "voiceover", label: "AI voice-over", blurb: "Type a script, pick a voice, get narration.", href: "/tools/ai-voiceover" },
];

export const HERO_FOOTAGE_CREDIT = {
  text: "Demo footage, CC BY:",
  links: [
    { label: "“Pilot”, all for Him", href: "https://www.youtube.com/watch?v=zUvXch90sAE" },
    { label: "“Maldives”, manisways", href: "https://www.youtube.com/watch?v=wqEHqKZziO4" },
    { label: "Unemployable Media", href: "https://www.youtube.com/watch?v=GL2-8q08PMA" },
    { label: "TRAVEL THAILAND 4K", href: "https://www.youtube.com/watch?v=t55fHqNbEhs" },
    { label: "Nanditha Plays", href: "https://www.youtube.com/watch?v=BVtEjWIcswM" },
    { label: "The Vivek Somani Show", href: "https://www.youtube.com/watch?v=uf10UbP9rQM" },
    { label: "SuperTuxKart by Jooched", href: "https://www.youtube.com/watch?v=nNTAPlRDTvM" },
  ],
};

const D = "/hero/demo";
export const media = (name: string) => ({ src: `${D}/${name}.mp4`, poster: `${D}/${name}.webp` });

/** The platform glyph over each demo clip (illustrative: where a clip like it would go). */
export type ClipPlatform = "youtube" | "instagram" | "linkedin" | "tiktok" | "facebook" | "x";

export interface DemoClip {
  name: string;
  ratio: "16:9" | "9:16" | "1:1";
  platform: ClipPlatform;
  /**
   * Virality score, 0-99, as AutoClip shows on real clips
   * (lib/virality-score.ts). Illustrative on these demo clips.
   */
  score: number;
}

/**
 * The AI clipping panel cycles through rounds: the drawn cursor clicks Get
 * clips, the long video drops through the link bar into the row, and its
 * clips spread out from the middle. Every round uses the same ratio order,
 * so the row's layout (and the paths measured from it) never changes.
 */
export interface ClipRound {
  long: string;
  /** Length of the long source video, shown on its card. */
  longLength: string;
  clips: DemoClip[];
}

const RATIOS: DemoClip["ratio"][] = ["16:9", "9:16", "1:1", "9:16", "9:16", "1:1"];
const PLATFORMS: ClipPlatform[] = ["youtube", "instagram", "linkedin", "tiktok", "facebook", "x"];
const round = (n: number, longLength: string, scores: number[]): ClipRound => ({
  long: `cr${n}-long`,
  longLength,
  clips: scores.map((score, i) => ({ name: `cr${n}-${i + 1}`, ratio: RATIOS[i], platform: PLATFORMS[i], score })),
});

// Neon podcast, street food festival, live stream, teal-set podcast, kart racing.
export const CLIP_ROUNDS: ClipRound[] = [
  round(1, "1:22:21", [97, 99, 96, 98, 94, 92]),
  round(2, "4:18", [95, 98, 93, 97, 91, 96]),
  round(3, "2:47:12", [99, 94, 97, 92, 98, 95]),
  round(4, "54:50", [96, 93, 98, 95, 97, 91]),
  round(5, "2:23", [94, 97, 92, 99, 95, 93]),
];
