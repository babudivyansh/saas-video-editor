// Sample videos: one podcast, one gaming video and one colourful vlog, each
// cut to 10 minutes from a CC BY YouTube upload (licence checked on each
// video's page, 2026-11-22). Home's demo projects are AutoClip runs on them
// (lib/demo-projects.ts), and a demo's "Run AutoClip on this video" runs one
// for the user. CC BY asks for the title, the creator, a link and a note of
// changes wherever the footage is shown, so the demo page's credit renders
// straight from this table: keep it in step with the footage.
//
// The files live once, at a shared key under SAMPLE_KEY_PREFIX in our own
// bucket (scripts/build-sample-projects.sh cuts and uploads them). Running a
// sample adopts that key as an Asset in the user's library
// (app/api/sample-projects/[id]/route.ts), which is what lets AutoClip read it
// (lib/source-url.ts ownsKey). Nothing copies the bytes per user, so every
// S3 delete refuses keys under the prefix (utils/s3-upload.ts): one user
// deleting their sample must not take it away from everyone else.
//
// Client-safe: no server imports.

export const SAMPLE_KEY_PREFIX = "samples/";

export type SampleId = "podcast" | "gaming" | "vlog";

export interface SampleVideo {
  id: SampleId;
  /** The demo card's label: what kind of video it is. */
  label: string;
  /** The Asset's name in the user's library. */
  assetName: string;
  /** The source video, for the credit line. */
  title: string;
  creator: string;
  sourceUrl: string;
  /** Seconds, after the cut. Also the Clip Minutes a run costs (rounded up). */
  duration: number;
  width: number;
  height: number;
  /** Matches User.intendedUse, so the demo a user said they make comes first. */
  intendedUse: string;
  /** The caption template its demo run uses, picked for the kind of video
   *  (all Creator tier: the account that runs the demos needs that plan). */
  demoCaptionTemplateId: string;
}

/**
 * The AutoClip settings every demo run uses (with the sample's own caption
 * template). 12 clips is a ceiling: a 10-minute sample should give 8 to 12.
 */
export const DEMO_RUN_SETTINGS = { clipCount: 12, minDuration: 15, maxDuration: 60, aspectRatio: "9:16", instructions: "" } as const;

export const SAMPLE_VIDEOS: SampleVideo[] = [
  {
    id: "podcast",
    label: "Podcast",
    assetName: "Sample podcast: Where Are Rich Indians Investing Globally?",
    title: "Where Are Rich Indians Investing Globally?",
    creator: "Sonia Shenoy",
    sourceUrl: "https://www.youtube.com/watch?v=DnvvJvObuPs",
    duration: 600,
    width: 1280,
    height: 720,
    intendedUse: "podcast",
    demoCaptionTemplateId: "twomic",
  },
  {
    id: "gaming",
    label: "Gaming",
    assetName: "Sample gaming video: Replacing every Minecraft texture with my face",
    title: "Replacing EVERY Minecraft texture with my FACE!",
    creator: "Bandi",
    sourceUrl: "https://www.youtube.com/watch?v=-fueAmTcIDQ",
    duration: 600,
    width: 1280,
    height: 720,
    intendedUse: "gaming",
    demoCaptionTemplateId: "comic",
  },
  {
    id: "vlog",
    label: "Travel vlog",
    assetName: "Sample vlog: First day in India, street food",
    title: "Our FIRST DAY in INDIA! Exploring India's Vibrant Street Food",
    creator: "THE DEPARTURE BRIEF",
    sourceUrl: "https://www.youtube.com/watch?v=iY_U9VZfdzg",
    duration: 600,
    width: 1280,
    height: 720,
    intendedUse: "vlog",
    demoCaptionTemplateId: "diary",
  },
];

export function sampleVideo(id: string): SampleVideo | undefined {
  return SAMPLE_VIDEOS.find((s) => s.id === id);
}

export const sampleVideoKey = (id: SampleId) => `${SAMPLE_KEY_PREFIX}${id}.mp4`;
export const sampleThumbnailKey = (id: SampleId) => `${SAMPLE_KEY_PREFIX}${id}.jpg`;
/** The demo card's still, served from public/ so Home never waits on S3. */
export const samplePoster = (id: SampleId) => `/samples/${id}.webp`;

/**
 * The assets a user's storage quota counts: live ones, minus samples, which
 * are one object for everybody and cost nothing per user. The quota check
 * (lib/asset-service.ts) and the Assets storage meter (app/api/assets) both
 * use this, so they always agree.
 */
export const COUNTS_TOWARD_STORAGE = { archivedAt: null, sourceFeature: { not: "sample" } } as const;

/** A shared sample object: never deleted on one user's behalf. */
export function isSampleKey(key: string): boolean {
  return key.startsWith(SAMPLE_KEY_PREFIX);
}

/** The samples, with the one matching what the user makes first. */
export function samplesFor(intendedUse: string | null | undefined): SampleVideo[] {
  const match = SAMPLE_VIDEOS.find((s) => s.intendedUse === intendedUse);
  return match ? [match, ...SAMPLE_VIDEOS.filter((s) => s !== match)] : SAMPLE_VIDEOS;
}
