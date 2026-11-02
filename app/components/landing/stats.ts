// Headline figures shared by the homepage SocialProof strip, the Features
// cards and /about. Typed rather than counted because SocialProof and
// Features are client components, and counting the voice catalogue here would
// ship all 200 library entries to the browser. stats.test.ts checks each
// figure against the real catalogue, so a shrinking catalogue fails CI
// instead of leaving an overclaim live.

/** Voices in lib/voices (starter + library), rounded down to a round number. */
export const VOICE_COUNT_LABEL = "200+";

/** Distinct languages those voices speak. */
export const VOICE_LANGUAGE_COUNT = 59;
