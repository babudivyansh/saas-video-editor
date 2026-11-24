"use client";
import { useState } from "react";
import AdminShell from "../../AdminShell";
import { CampaignEditor } from "../_components/CampaignEditor";
import { STARTERS } from "../_components/types";

type Starter = keyof typeof STARTERS;

export default function NewCampaignPage() {
  const [starter, setStarter] = useState<Starter>("sale");
  return (
    <AdminShell title="New campaign">
      <div className="flex items-center gap-2 mb-5" role="group" aria-label="Start from">
        <span className="text-xs font-semibold text-fg-subtle">Start from:</span>
        {(Object.keys(STARTERS) as Starter[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={starter === k}
            onClick={() => setStarter(k)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
              starter === k ? "border-primary/40 bg-primary/10 text-primary" : "border-line text-fg-muted hover:text-fg"
            }`}
          >
            {STARTERS[k].label}
          </button>
        ))}
      </div>
      {/* Keyed so switching starter resets the editor. */}
      <CampaignEditor key={starter} initial={STARTERS[starter].draft} />
    </AdminShell>
  );
}
