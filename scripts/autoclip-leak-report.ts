import "dotenv/config";
import { prisma } from "../lib/prisma";

/**
 * READ-ONLY report: AutoClip runs that ended without delivering, but whose
 * up-front charge is still held.
 *
 * Until fix/autoclip-money-leaks, the only thing that ever returned any of the
 * worst-case charge taken at Generate (refId `auto-clip:{projectId}`) was
 * settleRunCost — on the SUCCESS path. So these kept their credits:
 *   - a run whose analysis failed (too short, over the plan's length cap,
 *     Gemini/S3 errors) — project "failed", no clips;
 *   - a run whose render failed outright — project "failed", no ready clips;
 *   - a run stranded on "analyzing" by a restart (the in-process queue loses
 *     jobs, and nothing swept that state).
 * The fix stops new leaks. This lists the old ones, with amounts, so a human
 * can decide whether and how to make them good.
 *
 * Run (point DATABASE_URL at a read-only role for production):
 *   npx tsx scripts/autoclip-leak-report.ts
 *
 * WRITES NOTHING — only findMany / groupBy. Deliberately no --apply flag:
 * refunding is a decision, and restoreSpend is the tool for it once made.
 */

/** A project on "analyzing" this long is not coming back on its own. */
const STRANDED_AFTER_MS = 60 * 60 * 1000;

async function main() {
  const strandedBefore = new Date(Date.now() - STRANDED_AFTER_MS);
  const candidates = await prisma.project.findMany({
    where: {
      OR: [
        { status: "failed" },
        { status: "analyzing", updatedAt: { lt: strandedBefore } },
      ],
      // Only projects that ever went through an AutoClip charge.
      user: { creditTransactions: { some: { refId: { startsWith: "auto-clip:" } } } },
    },
    select: {
      id: true, userId: true, status: true, updatedAt: true, failureReason: true,
      user: { select: { email: true } },
      clips: { where: { status: "ready" }, select: { id: true } },
    },
  });

  type Row = { projectId: string; email: string; status: string; updatedAt: string; held: number; reason: string };
  const rows: Row[] = [];
  for (const p of candidates) {
    if (p.clips.length > 0) continue; // it delivered something; partial refunds ran
    const ledger = await prisma.creditTransaction.findMany({
      where: { userId: p.userId, refId: `auto-clip:${p.id}` },
      select: { delta: true },
    });
    const held = -ledger.reduce((s, r) => s + r.delta, 0);
    if (held <= 0) continue;
    rows.push({
      projectId: p.id,
      email: p.user.email,
      status: p.status,
      updatedAt: p.updatedAt.toISOString(),
      held,
      reason: (p.failureReason ?? "").slice(0, 60),
    });
  }

  rows.sort((a, b) => b.held - a.held);
  console.table(rows);
  const users = new Set(rows.map((r) => r.email)).size;
  const total = rows.reduce((s, r) => s + r.held, 0);
  console.log(`\n${rows.length} run(s), ${users} user(s), ${total} credit(s) held with nothing delivered.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
