// Warns admins before the ElevenLabs credit pool runs out (pricing audit
// 2026-11-26).
//
// One ElevenLabs account backs every Clipiro user, and its monthly credits are
// shared by AutoClip transcription (Scribe), voiceover, voice previews,
// dubbing, voice changer and enhance-speech. On a plan that cannot extend its
// limit (Starter: 30,000 credits, no overage) the pool simply stops: TTS and
// dubbing fail and transcription falls back to Whisper with worse word timing.
// Nothing told anyone it was getting close.
//
// Checked once a day from the refill-credits cron. Each threshold notifies
// once per billing period; the period is the plan's reset time when ElevenLabs
// reports it, otherwise the calendar month.

import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { notifyAdmins } from "@/lib/notify";

export const QUOTA_ALERT_THRESHOLDS = [0.8, 0.95] as const;
const CONFIG_KEY = "elevenlabs_quota_alert";

export interface QuotaSnapshot {
  used: number;
  limit: number;
  canExtend: boolean;
  /** Identifies the billing period, so a new month re-arms the alerts. */
  period: string;
}

interface AlertState {
  period: string;
  /** Highest threshold already notified in this period. */
  level: number;
}

/** The threshold to notify now, or null. Pure, for tests. */
export function quotaAlertDue(q: QuotaSnapshot, prev: AlertState | null): number | null {
  if (!(q.limit > 0)) return null;
  const share = q.used / q.limit;
  const reached = QUOTA_ALERT_THRESHOLDS.filter((t) => share >= t);
  if (reached.length === 0) return null;
  const top = reached[reached.length - 1];
  const already = prev && prev.period === q.period ? prev.level : 0;
  return top > already ? top : null;
}

async function fetchQuota(): Promise<QuotaSnapshot | null> {
  if (!env.ELEVENLABS_API_KEY) return null;
  const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`ElevenLabs subscription ${res.status}`);
  const j = (await res.json()) as {
    tier?: string; character_count?: number; character_limit?: number;
    can_extend_character_limit?: boolean; next_character_count_reset_unix?: number;
  };
  const now = new Date();
  return {
    used: j.character_count ?? 0,
    limit: j.character_limit ?? 0,
    canExtend: j.can_extend_character_limit === true,
    period: j.next_character_count_reset_unix
      ? String(j.next_character_count_reset_unix)
      : `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`,
  };
}

/** Best-effort: never throws, so it cannot fail the cron that calls it. */
export async function checkElevenLabsQuota(): Promise<number | null> {
  try {
    const q = await fetchQuota();
    if (!q) return null;
    const row = await prisma.config.findUnique({ where: { key: CONFIG_KEY } });
    let prev: AlertState | null = null;
    try { prev = row ? (JSON.parse(row.value) as AlertState) : null; } catch { prev = null; }

    const due = quotaAlertDue(q, prev);
    if (due === null) return null;

    const pct = Math.round((q.used / q.limit) * 100);
    const what = q.canExtend
      ? "Usage past the limit is billed as overage."
      : "The plan has no overage: at 100% voiceover, dubbing and voice tools stop, and AutoClip transcription falls back to Whisper.";
    await notifyAdmins(
      "admin_provider_quota",
      `ElevenLabs credits ${pct}% used`,
      `${q.used.toLocaleString("en-US")} of ${q.limit.toLocaleString("en-US")} this period. ${what}`,
      "/admin/ops",
      { provider: "elevenlabs", used: q.used, limit: q.limit, threshold: due },
    );
    const value = JSON.stringify({ period: q.period, level: due } satisfies AlertState);
    await prisma.config.upsert({ where: { key: CONFIG_KEY }, create: { key: CONFIG_KEY, value }, update: { value } });
    logger.warn("elevenlabs-quota", `credits ${pct}% used (${q.used}/${q.limit})`);
    return due;
  } catch (err) {
    logger.warn("elevenlabs-quota", "quota check failed", err);
    return null;
  }
}
