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
// The 32 ELEVENLABS_VOICE_* overrides are DEPRECATED - the voice_catalog
// Config row supersedes them and, unlike these, needs no deploy. They are
// still read for one release so production behaviour is unchanged.

export const PROVIDER_VOICE_IDS: Record<string, string> = {
  adam: process.env.ELEVENLABS_VOICE_ADAM || "pNInz6obpgDQGcFmaJgB",
  alice: process.env.ELEVENLABS_VOICE_ALICE || "Xb7hH8MSUJpSbSDYk0k2",
  amir1: process.env.ELEVENLABS_VOICE_AMIR1 || "ZQe5CZNOzWyzPSCn5a3c",
  amir2: process.env.ELEVENLABS_VOICE_AMIR2 || "bVMeCyTHy58xNoL34h3p",
  aria: process.env.ELEVENLABS_VOICE_ARIA || "9BWtsMINqrJLrRacOk9x",
  bella: process.env.ELEVENLABS_VOICE_BELLA || "EXAVITQu4vr4xnSDxMaL",
  charlie: process.env.ELEVENLABS_VOICE_CHARLIE || "yoZ06aMxZJJ28mfd3POQ",
  charlotte: process.env.ELEVENLABS_VOICE_CHARLOTTE || "XB0fDUnXU5powFXDhCwa",
  clyde: process.env.ELEVENLABS_VOICE_CLYDE || "2EiwWnXFnvU5JabPnv8n",
  dandan: process.env.ELEVENLABS_VOICE_DANDAN || "TxGEqnHWrfWFTfGW9XjX",
  daniel: process.env.ELEVENLABS_VOICE_DANIEL || "onwK4e9ZLuTAKqWW03F9",
  dave: process.env.ELEVENLABS_VOICE_DAVE || "CYw3kZ02Hs0563khs1Fj",
  elli: process.env.ELEVENLABS_VOICE_ELLI || "MF3mGyEYCl7XYWbV9V6O",
  emily: process.env.ELEVENLABS_VOICE_EMILY || "LcfcDJNUP1GQjkzn1xUU",
  ethan: process.env.ELEVENLABS_VOICE_ETHAN || "g5CIjZEefAph4nQFvHAz",
  fin: process.env.ELEVENLABS_VOICE_FIN || "D38z5RcWu1voky8WS1ja",
  freya: process.env.ELEVENLABS_VOICE_FREYA || "jsCqWAovK2LkecY7zXl4",
  grace: process.env.ELEVENLABS_VOICE_GRACE || "oWAxZDx7w5VEj9dCyTzz",
  harry: process.env.ELEVENLABS_VOICE_HARRY || "SOYHLrjzK2X1ezoPC6cr",
  josh: process.env.ELEVENLABS_VOICE_JOSH || "TxGEqnHWrfWFTfGW9XjX",
  liam: process.env.ELEVENLABS_VOICE_LIAM || "TX3LPaxmHKxFdv7VOQHJ",
  matilda: process.env.ELEVENLABS_VOICE_MATILDA || "XrExE9yKIg1WjnnlVkGX",
  matthew: process.env.ELEVENLABS_VOICE_MATTHEW || "Yko7PKHZNXotIFUBG7I9",
  natasha: process.env.ELEVENLABS_VOICE_NATASHA || "21m00Tcm4TlvDq8ikWAM",
  patrick: process.env.ELEVENLABS_VOICE_PATRICK || "ODq5zmih8GrVes37Dy9a",
  rachel: process.env.ELEVENLABS_VOICE_RACHEL || "21m00Tcm4TlvDq8ikWAM",
  sam: process.env.ELEVENLABS_VOICE_SAM || "yoZ06aMxZJJ28mfd3POQ",
  sarah: process.env.ELEVENLABS_VOICE_SARAH || "EXAVITQu4vr4xnSDxMaL",
  serena: process.env.ELEVENLABS_VOICE_SERENA || "pMsXgVXv3BLzUgSXRplE",
  spongebob: process.env.ELEVENLABS_VOICE_SPONGEBOB || "jBpfuIE2acCO8z3wKNLl",
  thomas: process.env.ELEVENLABS_VOICE_THOMAS || "GBv7mTt0atIp3Br8iCZE",
  william: process.env.ELEVENLABS_VOICE_WILLIAM || "VR6AewLTigWG4xSOukaG",
};

/** The id to synthesize with, or undefined when the slug is not a seed voice. */
export function providerVoiceIdFor(slug: string): string | undefined {
  return PROVIDER_VOICE_IDS[slug];
}
