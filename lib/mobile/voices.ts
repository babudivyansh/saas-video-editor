import type { ClonedVoice } from "@clipiro/shared";
import { addClonedVoice, listClonedVoices } from "@/lib/cloned-voices";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { downloadS3ObjectToBuffer } from "@/utils/s3-upload";

// The app's My Voices (mobile Phase 12.2) on lib/cloned-voices.ts. Cloning is
// behind VOICE_CLONING_ENABLED (decision P1 A): ElevenLabs' free tier can't
// clone, so the app says "coming soon" until the account is upgraded and the
// switch turned on. A cloned voice is referred to as "clone:<row id>"
// everywhere in the app; only the server knows its ElevenLabs id.

export const CLONE_PREFIX = "clone:";
/** A sample longer than this isn't needed: ElevenLabs wants 30 s to a few minutes. */
export const MAX_SAMPLE_BYTES = 10 * 1024 * 1024;

export const cloningEnabled = () => env.VOICE_CLONING_ENABLED === "true";

export class VoiceError extends Error {
  constructor(public status: number, message: string, public code: string) {
    super(message);
  }
}

export async function listClones(userId: string): Promise<ClonedVoice[]> {
  return (await listClonedVoices(userId)).map((v) => ({ id: `${CLONE_PREFIX}${v.id}`, name: v.name, createdAt: v.createdAt.toISOString() }));
}

const rowId = (id: string) => (id.startsWith(CLONE_PREFIX) ? id.slice(CLONE_PREFIX.length) : id);

/**
 * The voice id to synthesise with: a catalogue slug as it is, or a cloned
 * voice's ElevenLabs id when the caller owns it. Null for someone else's.
 */
export async function resolveVoiceRef(userId: string, voiceId: string): Promise<string | null> {
  if (!voiceId.startsWith(CLONE_PREFIX)) return voiceId;
  const row = await prisma.clonedVoice.findFirst({ where: { id: rowId(voiceId), userId }, select: { elevenLabsVoiceId: true } });
  return row?.elevenLabsVoiceId ?? null;
}

/** Clones a voice from an audio sample the person put in Assets. */
export async function cloneFromAsset(userId: string, name: string, assetId: string): Promise<ClonedVoice> {
  if (!cloningEnabled()) throw new VoiceError(503, "Voice cloning is coming soon.", "cloning_unavailable");
  const asset = await prisma.asset.findFirst({ where: { id: assetId, userId, archivedAt: null }, select: { name: true, s3Key: true, kind: true, size: true, status: true } });
  if (!asset) throw new VoiceError(404, "That recording isn’t in your Assets any more.", "not_found");
  if (asset.kind !== "audio" && asset.kind !== "video") throw new VoiceError(400, "The sample has to be an audio recording.", "wrong_kind");
  if (asset.status !== "ready") throw new VoiceError(409, "That recording is still being processed.", "not_ready");
  if (Number(asset.size) > MAX_SAMPLE_BYTES) throw new VoiceError(413, "Use a shorter sample: up to 10 MB.", "too_big");

  const sample = await downloadS3ObjectToBuffer(asset.s3Key);
  const r = await addClonedVoice(userId, name, sample, asset.name);
  if (!r.ok) throw new VoiceError(r.status, r.error, r.status === 409 ? "voice_limit" : r.status === 503 ? "cloning_unavailable" : "clone_failed");
  return { id: `${CLONE_PREFIX}${r.id}`, name: name.trim(), createdAt: new Date().toISOString() };
}

export async function renameClone(userId: string, id: string, name: string): Promise<ClonedVoice> {
  const row = await prisma.clonedVoice.findFirst({ where: { id: rowId(id), userId } });
  if (!row) throw new VoiceError(404, "That voice isn’t here any more.", "not_found");
  const next = await prisma.clonedVoice.update({ where: { id: row.id }, data: { name: name.trim() } });
  return { id: `${CLONE_PREFIX}${next.id}`, name: next.name, createdAt: next.createdAt.toISOString() };
}

export { rowId as cloneRowId };
