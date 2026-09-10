// The background-music library: one list, real slugs, one base URL.
//
// This replaces two hardcoded lists that had drifted apart — reddit-video
// carried "Lo-fi Chill" and "Dark Trap", text-video carried "Fluffing Duck" and
// "I was only temporary", and they disagreed on how long "Motivational Rise"
// runs. Worse, text-video had no slug field at all: it derived the S3 key by
// slugifying the DISPLAY NAME, so any label that didn't match its object key
//404'd silently. Here `slug` and `name` are separate fields and the key is
// never derived from a label, which makes that class of bug unrepresentable.
//
// ── READ THIS BEFORE ADDING A TRACK ────────────────────────────────────────
// As of 2026-09-10 the bucket has NO `music/` prefix: every track below points
// at an object that does not exist, and the bucket denies anonymous reads
// besides. Both render routes catch the download failure and continue without
// music, so a user picks a track, sees a waveform, and gets a silent video.
// Run `node scripts/verify-music-assets.mjs` to check the current state.
//
// Client-safe (no server imports) so the create pages can render it directly.

/** Raw process.env, not lib/env.ts — this module is imported by client pages. */
const BASE =
  process.env.NEXT_PUBLIC_MUSIC_BASE ??
  "https://saas-video-editor-assets.s3.ap-south-1.amazonaws.com/music";

export interface MusicTrack {
  /** The S3 object key stem. NEVER derived from `name`. */
  slug: string;
  name: string;
  /** Display only. */
  duration: string;
  /** False hides it from pickers without deleting the entry. */
  active?: boolean;
}

export const MUSIC_TRACKS: MusicTrack[] = [
  { slug: "green-to-blue", name: "Green to Blue", duration: "3m 8s" },
  { slug: "wii-shop-trap-theme", name: "Wii Shop Trap Theme", duration: "1m 0s" },
  { slug: "milk-cassette", name: "Milk Cassette", duration: "5m 8s" },
  { slug: "bladerunner", name: "Bladerunner", duration: "3m 48s" },
  { slug: "3am-walk", name: "3am Walk", duration: "1m 0s" },
  { slug: "lo-fi-chill", name: "Lo-fi Chill", duration: "4m 12s" },
  { slug: "phonk-drive", name: "Phonk Drive", duration: "2m 30s" },
  { slug: "epic-cinematic", name: "Epic Cinematic", duration: "3m 55s" },
  { slug: "sad-piano", name: "Sad Piano", duration: "2m 18s" },
  // The two lists disagreed on this one (2m 45s vs 2m 40s). Neither is verified
  // against a real file, because there is no real file yet.
  { slug: "motivational-rise", name: "Motivational Rise", duration: "2m 45s" },
  { slug: "dark-trap", name: "Dark Trap", duration: "1m 55s" },
  { slug: "fluffing-duck", name: "Fluffing Duck", duration: "1m 7s" },
  { slug: "i-was-only-temporary", name: "I was only temporary", duration: "1m 0s" },
];

/** What a picker shows. */
export const ACTIVE_MUSIC_TRACKS = MUSIC_TRACKS.filter((t) => t.active !== false);

/** The URL for a track. The one place a music URL is built. */
export function musicUrl(slug: string): string {
  return `${BASE}/${slug}.mp3`;
}

export function musicTrackBySlug(slug: string): MusicTrack | undefined {
  return MUSIC_TRACKS.find((t) => t.slug === slug);
}
