import * as React from "react";
import { cx } from "../../utils/cx";
import { CreditBadge, CreditBadgeProps } from "../CreditBadge/CreditBadge";

export interface ToolCardProps {
  /** Tool name, e.g. "AI Voiceover". */
  name: string;
  /** Underlying engine, e.g. "ElevenLabs TTS" — shown as a small muted subtitle. */
  engine?: string;
  cost: CreditBadgeProps["cost"];
  veo3?: boolean;
  className?: string;
}

/** Matches the app's credit-cost list row (pricing page "Credit Costs" section). */
export function ToolCard({ name, engine, cost, veo3, className = "" }: ToolCardProps) {
  return (
    <div
      className={cx(
        "flex items-center justify-between gap-4 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-bold text-gray-900 truncate dark:text-zinc-100">{name}</p>
        {engine && <p className="text-xs text-gray-400 truncate">{engine}</p>}
      </div>
      <CreditBadge cost={cost} veo3={veo3} />
    </div>
  );
}
