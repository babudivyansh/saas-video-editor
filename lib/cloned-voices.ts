// Cloned-voice CRUD: DB records + the ElevenLabs vendor calls (utils/elevenlabs.ts)
// that back them. Mirrors lib/social/competitors.ts's shape — a thin
// orchestration layer over a vendor-agnostic utility, not vendor logic itself.

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { cloneVoice, deleteClonedVoice, elevenLabsVoiceSlotsRemaining } from "@/utils/elevenlabs";

// Per-user slot cap — a plan-tier lever later; one sane number for now,
// same reasoning as MAX_COMPETITORS in lib/social/competitors.ts.
export const MAX_CLONED_VOICES_PER_USER = 3;

// Below this many free shared slots, stop accepting new clones even if the
// requesting user is under their own cap — the shared ElevenLabs ceiling is
// an account-wide constraint no per-user check can substitute for.
const SHARED_SLOT_SAFETY_MARGIN = 5;

export async function listClonedVoices(userId: string) {
  return prisma.clonedVoice.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, elevenLabsVoiceId: true, createdAt: true },
  });
}

export async function addClonedVoice(
  userId: string,
  name: string,
  sampleAudio: Buffer,
  filename: string,
): Promise<{ ok: true; id: string; voiceId: string } | { ok: false; error: string; status: number }> {
  const trimmedName = name.trim();
  if (!trimmedName) return { ok: false, error: "Name your voice before cloning.", status: 400 };

  const userCount = await prisma.clonedVoice.count({ where: { userId } });
  if (userCount >= MAX_CLONED_VOICES_PER_USER) {
    return { ok: false, error: `You can have up to ${MAX_CLONED_VOICES_PER_USER} cloned voices.`, status: 409 };
  }

  // Checked before calling ElevenLabs, not discovered from its response —
  // a breached shared limit blocks every user, so this has to be a
  // pre-flight check, not error handling.
  let remaining: number;
  try {
    remaining = await elevenLabsVoiceSlotsRemaining();
  } catch (e) {
    logger.error("cloned-voices", "failed to check ElevenLabs voice slot count", e);
    return { ok: false, error: "Couldn't reach the voice provider — please try again.", status: 502 };
  }
  if (remaining <= SHARED_SLOT_SAFETY_MARGIN) {
    logger.warn("cloned-voices", `voice cloning paused — only ${remaining} shared slots left`);
    return { ok: false, error: "Voice cloning is temporarily unavailable — please try again later.", status: 503 };
  }

  let voiceId: string;
  try {
    const result = await cloneVoice(trimmedName, sampleAudio, filename);
    voiceId = result.voiceId;
  } catch (e) {
    logger.error("cloned-voices", `ElevenLabs clone failed for user ${userId}`, e);
    return { ok: false, error: "Voice cloning failed — check the sample audio and try again.", status: 502 };
  }

  const row = await prisma.clonedVoice.create({
    data: { userId, name: trimmedName, elevenLabsVoiceId: voiceId },
  });
  return { ok: true, id: row.id, voiceId };
}

export async function removeClonedVoice(userId: string, id: string): Promise<boolean> {
  const row = await prisma.clonedVoice.findFirst({ where: { id, userId } });
  if (!row) return false;
  await prisma.clonedVoice.delete({ where: { id } });
  // DB row is the source of truth for "does the user still have this voice"
  // — a failure freeing the ElevenLabs-side slot shouldn't leave the row
  // stuck undeletable, so this is best-effort after the DB delete succeeds.
  try {
    await deleteClonedVoice(row.elevenLabsVoiceId);
  } catch (e) {
    logger.warn("cloned-voices", `ElevenLabs voice delete failed for ${row.elevenLabsVoiceId}`, { reason: (e as Error).message });
  }
  return true;
}
