import { env } from "@/lib/env";

/**
 * Maps frontend voice slugs to ElevenLabs voice_id strings.
 * Standard ElevenLabs voices available on all plans.
 * Custom/cloned voices can be added via ELEVENLABS_VOICE_* env vars.
 */
export const VOICE_ID_MAP: Record<string, string> = {
  // Male voices
  william:   env.ELEVENLABS_VOICE_WILLIAM   ?? "VR6AewLTigWG4xSOukaG", // Arnold
  adam:      env.ELEVENLABS_VOICE_ADAM      ?? "pNInz6obpgDQGcFmaJgB", // Adam
  dandan:    env.ELEVENLABS_VOICE_DANDAN    ?? "TxGEqnHWrfWFTfGW9XjX", // Josh
  charlie:   env.ELEVENLABS_VOICE_CHARLIE   ?? "yoZ06aMxZJJ28mfd3POQ", // Sam
  clyde:     env.ELEVENLABS_VOICE_CLYDE     ?? "2EiwWnXFnvU5JabPnv8n", // Clyde
  daniel:    env.ELEVENLABS_VOICE_DANIEL    ?? "onwK4e9ZLuTAKqWW03F9", // Daniel (British)
  dave:      env.ELEVENLABS_VOICE_DAVE      ?? "CYw3kZ02Hs0563khs1Fj", // Dave
  ethan:     env.ELEVENLABS_VOICE_ETHAN     ?? "g5CIjZEefAph4nQFvHAz", // Ethan
  fin:       env.ELEVENLABS_VOICE_FIN       ?? "D38z5RcWu1voky8WS1ja", // Fin
  harry:     env.ELEVENLABS_VOICE_HARRY     ?? "SOYHLrjzK2X1ezoPC6cr", // Harry
  josh:      env.ELEVENLABS_VOICE_JOSH      ?? "TxGEqnHWrfWFTfGW9XjX", // Josh
  liam:      env.ELEVENLABS_VOICE_LIAM      ?? "TX3LPaxmHKxFdv7VOQHJ", // Liam
  matthew:   env.ELEVENLABS_VOICE_MATTHEW   ?? "Yko7PKHZNXotIFUBG7I9", // Matthew
  patrick:   env.ELEVENLABS_VOICE_PATRICK   ?? "ODq5zmih8GrVes37Dy9a", // Patrick
  sam:       env.ELEVENLABS_VOICE_SAM       ?? "yoZ06aMxZJJ28mfd3POQ", // Sam
  thomas:    env.ELEVENLABS_VOICE_THOMAS    ?? "GBv7mTt0atIp3Br8iCZE", // Thomas
  // Female voices
  natasha:   env.ELEVENLABS_VOICE_NATASHA   ?? "21m00Tcm4TlvDq8ikWAM", // Rachel
  alice:     env.ELEVENLABS_VOICE_ALICE     ?? "Xb7hH8MSUJpSbSDYk0k2", // Alice
  aria:      env.ELEVENLABS_VOICE_ARIA      ?? "9BWtsMINqrJLrRacOk9x", // Aria
  bella:     env.ELEVENLABS_VOICE_BELLA     ?? "EXAVITQu4vr4xnSDxMaL", // Bella
  charlotte: env.ELEVENLABS_VOICE_CHARLOTTE ?? "XB0fDUnXU5powFXDhCwa", // Charlotte
  elli:      env.ELEVENLABS_VOICE_ELLI      ?? "MF3mGyEYCl7XYWbV9V6O", // Elli
  emily:     env.ELEVENLABS_VOICE_EMILY     ?? "LcfcDJNUP1GQjkzn1xUU", // Emily
  freya:     env.ELEVENLABS_VOICE_FREYA     ?? "jsCqWAovK2LkecY7zXl4", // Freya
  grace:     env.ELEVENLABS_VOICE_GRACE     ?? "oWAxZDx7w5VEj9dCyTzz", // Grace
  matilda:   env.ELEVENLABS_VOICE_MATILDA   ?? "XrExE9yKIg1WjnnlVkGX", // Matilda
  rachel:    env.ELEVENLABS_VOICE_RACHEL    ?? "21m00Tcm4TlvDq8ikWAM", // Rachel
  sarah:     env.ELEVENLABS_VOICE_SARAH     ?? "EXAVITQu4vr4xnSDxMaL", // Sarah
  serena:    env.ELEVENLABS_VOICE_SERENA    ?? "pMsXgVXv3BLzUgSXRplE", // Serena
  // Special
  amir1:     env.ELEVENLABS_VOICE_AMIR1     ?? "ZQe5CZNOzWyzPSCn5a3c", // James
  amir2:     env.ELEVENLABS_VOICE_AMIR2     ?? "bVMeCyTHy58xNoL34h3p", // Jeremy
  spongebob: env.ELEVENLABS_VOICE_SPONGEBOB ?? "jBpfuIE2acCO8z3wKNLl", // Gigi (closest available)
};

export function resolveVoiceId(slug: string): string {
  return VOICE_ID_MAP[slug] ?? slug; // fall back to raw ID if not in map
}
