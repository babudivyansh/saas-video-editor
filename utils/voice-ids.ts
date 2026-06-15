/**
 * Maps frontend voice slugs to ElevenLabs voice_id strings.
 * Standard ElevenLabs voices available on all plans.
 * Custom/cloned voices can be added via ELEVENLABS_VOICE_* env vars.
 */
export const VOICE_ID_MAP: Record<string, string> = {
  // Male voices
  william:   process.env.ELEVENLABS_VOICE_WILLIAM   ?? "VR6AewLTigWG4xSOukaG", // Arnold
  adam:      process.env.ELEVENLABS_VOICE_ADAM      ?? "pNInz6obpgDQGcFmaJgB", // Adam
  dandan:    process.env.ELEVENLABS_VOICE_DANDAN    ?? "TxGEqnHWrfWFTfGW9XjX", // Josh
  charlie:   process.env.ELEVENLABS_VOICE_CHARLIE   ?? "yoZ06aMxZJJ28mfd3POQ", // Sam
  clyde:     process.env.ELEVENLABS_VOICE_CLYDE     ?? "2EiwWnXFnvU5JabPnv8n", // Clyde
  daniel:    process.env.ELEVENLABS_VOICE_DANIEL    ?? "onwK4e9ZLuTAKqWW03F9", // Daniel (British)
  dave:      process.env.ELEVENLABS_VOICE_DAVE      ?? "CYw3kZ02Hs0563khs1Fj", // Dave
  ethan:     process.env.ELEVENLABS_VOICE_ETHAN     ?? "g5CIjZEefAph4nQFvHAz", // Ethan
  fin:       process.env.ELEVENLABS_VOICE_FIN       ?? "D38z5RcWu1voky8WS1ja", // Fin
  harry:     process.env.ELEVENLABS_VOICE_HARRY     ?? "SOYHLrjzK2X1ezoPC6cr", // Harry
  josh:      process.env.ELEVENLABS_VOICE_JOSH      ?? "TxGEqnHWrfWFTfGW9XjX", // Josh
  liam:      process.env.ELEVENLABS_VOICE_LIAM      ?? "TX3LPaxmHKxFdv7VOQHJ", // Liam
  matthew:   process.env.ELEVENLABS_VOICE_MATTHEW   ?? "Yko7PKHZNXotIFUBG7I9", // Matthew
  patrick:   process.env.ELEVENLABS_VOICE_PATRICK   ?? "ODq5zmih8GrVes37Dy9a", // Patrick
  sam:       process.env.ELEVENLABS_VOICE_SAM       ?? "yoZ06aMxZJJ28mfd3POQ", // Sam
  thomas:    process.env.ELEVENLABS_VOICE_THOMAS    ?? "GBv7mTt0atIp3Br8iCZE", // Thomas
  // Female voices
  natasha:   process.env.ELEVENLABS_VOICE_NATASHA   ?? "21m00Tcm4TlvDq8ikWAM", // Rachel
  alice:     process.env.ELEVENLABS_VOICE_ALICE     ?? "Xb7hH8MSUJpSbSDYk0k2", // Alice
  aria:      process.env.ELEVENLABS_VOICE_ARIA      ?? "9BWtsMINqrJLrRacOk9x", // Aria
  bella:     process.env.ELEVENLABS_VOICE_BELLA     ?? "EXAVITQu4vr4xnSDxMaL", // Bella
  charlotte: process.env.ELEVENLABS_VOICE_CHARLOTTE ?? "XB0fDUnXU5powFXDhCwa", // Charlotte
  elli:      process.env.ELEVENLABS_VOICE_ELLI      ?? "MF3mGyEYCl7XYWbV9V6O", // Elli
  emily:     process.env.ELEVENLABS_VOICE_EMILY     ?? "LcfcDJNUP1GQjkzn1xUU", // Emily
  freya:     process.env.ELEVENLABS_VOICE_FREYA     ?? "jsCqWAovK2LkecY7zXl4", // Freya
  grace:     process.env.ELEVENLABS_VOICE_GRACE     ?? "oWAxZDx7w5VEj9dCyTzz", // Grace
  matilda:   process.env.ELEVENLABS_VOICE_MATILDA   ?? "XrExE9yKIg1WjnnlVkGX", // Matilda
  rachel:    process.env.ELEVENLABS_VOICE_RACHEL    ?? "21m00Tcm4TlvDq8ikWAM", // Rachel
  sarah:     process.env.ELEVENLABS_VOICE_SARAH     ?? "EXAVITQu4vr4xnSDxMaL", // Sarah
  serena:    process.env.ELEVENLABS_VOICE_SERENA    ?? "pMsXgVXv3BLzUgSXRplE", // Serena
  // Special
  amir1:     process.env.ELEVENLABS_VOICE_AMIR1     ?? "ZQe5CZNOzWyzPSCn5a3c", // James
  amir2:     process.env.ELEVENLABS_VOICE_AMIR2     ?? "bVMeCyTHy58xNoL34h3p", // Jeremy
  spongebob: process.env.ELEVENLABS_VOICE_SPONGEBOB ?? "jBpfuIE2acCO8z3wKNLl", // Gigi (closest available)
};

export function resolveVoiceId(slug: string): string {
  return VOICE_ID_MAP[slug] ?? slug; // fall back to raw ID if not in map
}
