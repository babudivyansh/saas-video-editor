// Slug -> ElevenLabs voice id. SERVER ONLY.
//
// Deliberately split out of lib/voices/catalog.ts so that file stays
// client-safe: the picker compiles the catalogue in as its offline fallback,
// and /api/voices strips the provider id from every response precisely so the
// ids that route a paid synthesis call never reach a browser. Keeping them in
// the module the client imports would have handed them over anyway.
//
// Read straight from process.env rather than lib/env.ts: this is a lookup
// table of optional overrides, and importing the validated env schema would
// make an otherwise-pure module refuse to load wherever DATABASE_URL is unset.
//
// The ELEVENLABS_VOICE_* overrides are DEPRECATED - the voice_catalog Config
// row supersedes them and, unlike these, needs no deploy. They are still read
// for one release so production behaviour is unchanged.
//
// REBUILT 2026-09-10 against GET /v1/voices on the live account. The previous
// table was inherited from the old hardcoded lists and 24 of its 32 ids were
// voices ElevenLabs has since retired - they 404 on this account, including
// `william`, which was the DEFAULT for every render. The ids below are the 22
// this account actually has.

export const PROVIDER_VOICE_IDS: Record<string, string> = {
  // ── The 22 voices this account actually has (verified live) ──────────────
  adam: process.env.ELEVENLABS_VOICE_ADAM || "pNInz6obpgDQGcFmaJgB",
  alice: process.env.ELEVENLABS_VOICE_ALICE || "Xb7hH8MSUJpSbSDYk0k2",
  bella: process.env.ELEVENLABS_VOICE_BELLA || "hpp4J3VqNfWAUOO0d1Us",
  bill: process.env.ELEVENLABS_VOICE_BILL || "pqHfZKP75CvOlQylNhV4",
  brian: process.env.ELEVENLABS_VOICE_BRIAN || "nPczCjzI2devNBz1zQrb",
  callum: process.env.ELEVENLABS_VOICE_CALLUM || "N2lVS1w4EtoT3dr4eOWO",
  charlie: process.env.ELEVENLABS_VOICE_CHARLIE || "IKne3meq5aSn9XLyUdCD",
  chris: process.env.ELEVENLABS_VOICE_CHRIS || "iP95p4xoKVk53GoZ742B",
  daniel: process.env.ELEVENLABS_VOICE_DANIEL || "onwK4e9ZLuTAKqWW03F9",
  eric: process.env.ELEVENLABS_VOICE_ERIC || "cjVigY5qzO86Huf0OWal",
  george: process.env.ELEVENLABS_VOICE_GEORGE || "JBFqnCBsd6RMkjVDRZzb",
  harry: process.env.ELEVENLABS_VOICE_HARRY || "SOYHLrjzK2X1ezoPC6cr",
  jessica: process.env.ELEVENLABS_VOICE_JESSICA || "cgSgspJ2msm6clMCkdW9",
  laura: process.env.ELEVENLABS_VOICE_LAURA || "FGY2WhTYpPnrIDTdsKH5",
  liam: process.env.ELEVENLABS_VOICE_LIAM || "TX3LPaxmHKxFdv7VOQHJ",
  lily: process.env.ELEVENLABS_VOICE_LILY || "pFZP5JQG7iQjIQuC4Bku",
  matilda: process.env.ELEVENLABS_VOICE_MATILDA || "XrExE9yKIg1WjnnlVkGX",
  river: process.env.ELEVENLABS_VOICE_RIVER || "SAz9YHcvj6GT2YYXdXww",
  roger: process.env.ELEVENLABS_VOICE_ROGER || "CwhRBWXzGAHq8TQ4Fs17",
  sarah: process.env.ELEVENLABS_VOICE_SARAH || "EXAVITQu4vr4xnSDxMaL",
  "sunny-singh": process.env.ELEVENLABS_VOICE_SUNNY_SINGH || "C9mPSTSfiDpIm4wTghYI",
  will: process.env.ELEVENLABS_VOICE_WILL || "bIHbv24MWmeRgasZH58o",

  // ── Retired slugs, kept so stored Project.voiceId rows still resolve ─────
  // Each points at the id of the surviving voice named beside it. Hidden from
  // pickers via `aliasOf` + `active: false` in catalog.ts.
  amir1: process.env.ELEVENLABS_VOICE_AMIR1 || "JBFqnCBsd6RMkjVDRZzb", // -> george
  amir2: process.env.ELEVENLABS_VOICE_AMIR2 || "TX3LPaxmHKxFdv7VOQHJ", // -> liam
  aria: process.env.ELEVENLABS_VOICE_ARIA || "FGY2WhTYpPnrIDTdsKH5", // -> laura
  charlotte: process.env.ELEVENLABS_VOICE_CHARLOTTE || "cgSgspJ2msm6clMCkdW9", // -> jessica
  clyde: process.env.ELEVENLABS_VOICE_CLYDE || "N2lVS1w4EtoT3dr4eOWO", // -> callum
  dandan: process.env.ELEVENLABS_VOICE_DANDAN || "nPczCjzI2devNBz1zQrb", // -> brian
  dave: process.env.ELEVENLABS_VOICE_DAVE || "bIHbv24MWmeRgasZH58o", // -> will
  elli: process.env.ELEVENLABS_VOICE_ELLI || "cgSgspJ2msm6clMCkdW9", // -> jessica
  emily: process.env.ELEVENLABS_VOICE_EMILY || "Xb7hH8MSUJpSbSDYk0k2", // -> alice
  ethan: process.env.ELEVENLABS_VOICE_ETHAN || "iP95p4xoKVk53GoZ742B", // -> chris
  fin: process.env.ELEVENLABS_VOICE_FIN || "pqHfZKP75CvOlQylNhV4", // -> bill
  freya: process.env.ELEVENLABS_VOICE_FREYA || "FGY2WhTYpPnrIDTdsKH5", // -> laura
  grace: process.env.ELEVENLABS_VOICE_GRACE || "XrExE9yKIg1WjnnlVkGX", // -> matilda
  josh: process.env.ELEVENLABS_VOICE_JOSH || "nPczCjzI2devNBz1zQrb", // -> brian
  matthew: process.env.ELEVENLABS_VOICE_MATTHEW || "JBFqnCBsd6RMkjVDRZzb", // -> george
  natasha: process.env.ELEVENLABS_VOICE_NATASHA || "EXAVITQu4vr4xnSDxMaL", // -> sarah
  patrick: process.env.ELEVENLABS_VOICE_PATRICK || "SOYHLrjzK2X1ezoPC6cr", // -> harry
  rachel: process.env.ELEVENLABS_VOICE_RACHEL || "EXAVITQu4vr4xnSDxMaL", // -> sarah
  sam: process.env.ELEVENLABS_VOICE_SAM || "cjVigY5qzO86Huf0OWal", // -> eric
  serena: process.env.ELEVENLABS_VOICE_SERENA || "hpp4J3VqNfWAUOO0d1Us", // -> bella
  spongebob: process.env.ELEVENLABS_VOICE_SPONGEBOB || "cgSgspJ2msm6clMCkdW9", // -> jessica
  thomas: process.env.ELEVENLABS_VOICE_THOMAS || "SAz9YHcvj6GT2YYXdXww", // -> river
  william: process.env.ELEVENLABS_VOICE_WILLIAM || "nPczCjzI2devNBz1zQrb", // -> brian
};

/** The id to synthesize with, or undefined when the slug is not a seed voice. */
export function providerVoiceIdFor(slug: string): string | undefined {
  return PROVIDER_VOICE_IDS[slug];
}
