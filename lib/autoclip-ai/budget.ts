// Per-run spending guard for the optional AI work.
//
// The run itself is paid in Clip Minutes; nothing here charges the user. This
// caps what CLIPIRO spends on one run's extras (vision ranking, scene vision,
// generated inserts, GPU tracking), so a 20-clip run of a long source on a
// cheap tier can't quietly cost more than it earns. Each call reserves its
// estimated cost first; once the ceiling is reached the remaining optional
// steps are skipped and the clip renders the way it would have without them.

import type { AiCostEntry } from "@/lib/autoclip-ai/types";

export class AiBudget {
  private spent = 0;
  private readonly entries: (AiCostEntry & { clip: number | null })[] = [];

  constructor(readonly ceilingUsd: number) {}

  /** Reserve `usd` for `kind`. False (and nothing recorded) when it won't fit. */
  tryReserve(kind: string, usd: number, clip: number | null = null): boolean {
    const cost = Math.max(0, usd);
    if (this.spent + cost > this.ceilingUsd + 1e-9) return false;
    this.spent += cost;
    this.entries.push({ kind, usd: Math.round(cost * 10_000) / 10_000, clip });
    return true;
  }

  get spentUsd(): number { return this.spent; }
  get remainingUsd(): number { return Math.max(0, this.ceilingUsd - this.spent); }

  /** The entries charged to one clip, for its aiMeta.cost. */
  forClip(clip: number): AiCostEntry[] {
    return this.entries.filter((e) => e.clip === clip).map(({ kind, usd }) => ({ kind, usd }));
  }

  /** Run-level entries (not tied to a clip). */
  shared(): AiCostEntry[] {
    return this.entries.filter((e) => e.clip === null).map(({ kind, usd }) => ({ kind, usd }));
  }
}

/** A budget that refuses everything — for a run with every feature off. */
export const NO_BUDGET = (): AiBudget => new AiBudget(0);
