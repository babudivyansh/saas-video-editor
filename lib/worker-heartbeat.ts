// Worker liveness: each background worker refreshes a short-TTL Redis key so
// the admin ops page can tell "worker running" from "worker silently dead" —
// previously there was no way to know without SSHing in.

import { redis } from "@/lib/redis";

const INTERVAL_MS = 30_000;
const TTL_SECONDS = 90; // 3 missed beats = considered down

export function startHeartbeat(name: string): void {
  const beat = () => {
    void redis.set(`worker:heartbeat:${name}`, new Date().toISOString(), "EX", TTL_SECONDS);
  };
  beat();
  const timer = setInterval(beat, INTERVAL_MS);
  // Never keep the process alive just to heartbeat.
  if (typeof timer.unref === "function") timer.unref();
}

export async function getHeartbeats(names: string[]): Promise<Record<string, string | null>> {
  const entries = await Promise.all(
    names.map(async (n) => [n, await redis.get(`worker:heartbeat:${n}`)] as const),
  );
  return Object.fromEntries(entries);
}
