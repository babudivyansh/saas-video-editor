import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { CHAIN_GENESIS, CHAIN_HEAD_KEY, hashAuditRow } from "@/lib/admin/audit";

// Walks the audit hash chain and reports anything that doesn't add up:
//
//   tampered — a row whose stored hash no longer matches its content (edited)
//   broken   — a row whose prevHash doesn't point at any row (the row before it
//              was deleted), or two rows claiming the same predecessor (fork)
//   headMissing — the newest hash recorded at write time (Redis) isn't the
//              chain's last row: the newest rows were deleted
//
// Rows written before hashing began have no hash and are counted as legacy —
// they can be read, not verified.

export interface AuditVerifyResult {
  ok: boolean;
  checkedAt: string;
  totalRows: number;
  legacyRows: number;
  verifiedRows: number;
  chainStartedAt: string | null;
  head: { id: string; createdAt: string } | null;
  tampered: Array<{ id: string; action: string; createdAt: string }>;
  broken: Array<{ id: string; action: string; createdAt: string; problem: string }>;
  headMissing: boolean;
}

const BATCH = 1000;

export async function verifyAuditChain(): Promise<AuditVerifyResult> {
  const [totalRows, legacyRows] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.count({ where: { hash: null } }),
  ]);

  const tampered: AuditVerifyResult["tampered"] = [];
  const broken: AuditVerifyResult["broken"] = [];
  const byPrev = new Map<string, string[]>(); // prevHash → ids claiming it
  const hashes = new Set<string>();
  const info = new Map<string, { action: string; createdAt: string; prevHash: string | null }>();
  let first: { createdAt: Date } | null = null;
  let last: { id: string; createdAt: Date; hash: string } | null = null;
  let cursor: string | undefined;

  for (;;) {
    const batch = await prisma.auditLog.findMany({
      where: { hash: { not: null } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (batch.length === 0) break;
    for (const row of batch) {
      first ??= row;
      last = { id: row.id, createdAt: row.createdAt, hash: row.hash! };
      const createdAt = row.createdAt.toISOString();
      if (hashAuditRow(row) !== row.hash) tampered.push({ id: row.id, action: row.action, createdAt });
      hashes.add(row.hash!);
      info.set(row.id, { action: row.action, createdAt, prevHash: row.prevHash });
      const key = row.prevHash ?? "";
      byPrev.set(key, [...(byPrev.get(key) ?? []), row.id]);
    }
    if (batch.length < BATCH) break;
    cursor = batch[batch.length - 1].id;
  }

  for (const [id, r] of info) {
    if (r.prevHash !== CHAIN_GENESIS && !hashes.has(r.prevHash ?? "")) {
      broken.push({ id, action: r.action, createdAt: r.createdAt, problem: "The entry before this one is missing (deleted)." });
    }
  }
  for (const [prev, ids] of byPrev) {
    if (ids.length > 1) {
      for (const id of ids.slice(1)) {
        const r = info.get(id)!;
        broken.push({ id, action: r.action, createdAt: r.createdAt, problem: `Shares its predecessor with another entry (fork at ${prev.slice(0, 12)}…).` });
      }
    }
  }

  const storedHead = await redis.get(CHAIN_HEAD_KEY).catch(() => null);
  // The newest hash recorded at write time must still exist. (A flushed Redis
  // has no head and can't vouch either way; a head older than the last row —
  // a missed Redis write — is still present, so it isn't flagged.)
  const headMissing = !!storedHead && !hashes.has(storedHead);

  return {
    ok: tampered.length === 0 && broken.length === 0 && !headMissing,
    checkedAt: new Date().toISOString(),
    totalRows,
    legacyRows,
    verifiedRows: info.size - tampered.length,
    chainStartedAt: first ? first.createdAt.toISOString() : null,
    head: last ? { id: last.id, createdAt: last.createdAt.toISOString() } : null,
    tampered,
    broken,
    headMissing,
  };
}
