"use client";

// The AI surface: the stored executive summary, and the button that spends
// credits to make a new one.
//
// Three things this gets right that the v1 insight card did not:
//   1. It states the price BEFORE the click, and asks again for confirmation.
//      A button that silently spends credits is a trap.
//   2. It distinguishes "not enough data yet" (409) from "out of credits"
//      (402) from "generation failed, you were not charged" (502) — three
//      different things the user can do something different about.
//   3. It is bearer-authenticated. /api/social/* reads the Authorization
//      header, so a client island sending only cookies gets a 402 that looks
//      exactly like a billing problem. That bug shipped once (stage 7c).

import { useCallback, useState } from "react";
import { Button } from "@/app/components/ui/Button";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import type { ExecutiveSummary, Recommendation } from "@/lib/social/ai/schemas";

type Period = "weekly" | "monthly" | "quarterly" | "annual";

export interface AiInsightsPanelProps {
  accountId: string;
  accountLabel: string;
  period?: Period;
  /** Credit price, read from tool-config on the server. Shown before the click. */
  cost: number;
  initialSummary: ExecutiveSummary | null;
  generatedAt: string | null;
}

type State =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "error"; message: string; action?: { label: string; href: string } };

export function AiInsightsPanel({
  accountId,
  accountLabel,
  period = "weekly",
  cost,
  initialSummary,
  generatedAt,
}: AiInsightsPanelProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [stamp, setStamp] = useState(generatedAt);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [confirming, setConfirming] = useState(false);

  const generate = useCallback(async () => {
    setConfirming(false);
    setState({ kind: "working" });
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/social/summary", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Bearer, not the session cookie: requireSubscriber reads this header.
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ accountId, period }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setState({ kind: "error", ...messageFor(res.status, body?.error) });
        return;
      }
      setSummary(body.data.summary.content as ExecutiveSummary);
      setStamp(body.data.summary.createdAt ?? new Date().toISOString());
      setState({ kind: "idle" });
    } catch {
      setState({ kind: "error", message: "Could not reach the server. Check your connection and try again." });
    }
  }, [accountId, period]);

  return (
    <section
      aria-labelledby="ai-insights-heading"
      className="rounded-[var(--radius-card)] border border-card-border bg-panel p-5 shadow-card"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="ai-insights-heading" className="text-sm font-semibold text-ink">
            {LABELS[period]} summary
          </h2>
          <p className="text-xs text-ink-soft">
            {stamp ? `Written ${new Date(stamp).toLocaleDateString("en-GB")} from ${accountLabel}'s own numbers` : `For ${accountLabel}`}
          </p>
        </div>
        <Button
          size="sm"
          variant={summary ? "secondary" : "primary"}
          onClick={() => setConfirming(true)}
          disabled={state.kind === "working"}
        >
          {state.kind === "working" ? "Writing…" : summary ? "Regenerate" : "Generate"}
          {cost > 0 && <span className="ml-1 opacity-80">· {cost} cr</span>}
        </Button>
      </div>

      {state.kind === "error" && (
        <p role="alert" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {state.message}
          {state.action && (
            <a href={state.action.href} className="ml-1.5 font-semibold underline">
              {state.action.label}
            </a>
          )}
        </p>
      )}

      {state.kind === "working" && (
        <div role="status" aria-live="polite" className="space-y-2">
          <span className="sr-only">Writing your summary</span>
          <div className="h-3 w-full animate-pulse rounded bg-surface" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-surface" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-surface" />
        </div>
      )}

      {state.kind !== "working" && !summary && (
        <p className="text-sm text-ink-soft">
          A short written read on how {accountLabel} is doing — what moved, what worked, and what to try
          next. Every figure it quotes is one this dashboard computed; it is never asked to do arithmetic.
        </p>
      )}

      {state.kind !== "working" && summary && (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-ink">{summary.summary}</p>
          <Bullets title="What worked" items={summary.wins} tone="text-emerald-800" />
          <Bullets title="What to watch" items={summary.concerns} tone="text-amber-800" />
          {summary.recommendations.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-widest text-ink-soft">Next steps</h3>
              <ul className="space-y-2">
                {summary.recommendations.map((rec: Recommendation, i) => (
                  <li key={i} className="rounded-xl bg-surface px-3 py-2">
                    <p className="text-sm font-semibold text-ink">{rec.title}</p>
                    <p className="text-xs text-ink-soft">{rec.rationale}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title={summary ? "Write a new summary?" : "Write this summary?"}
        // The price is stated again here, not just on the button: this is the
        // last moment before credits leave the account.
        message={
          cost > 0
            ? `This spends ${cost} credit${cost === 1 ? "" : "s"}. If it fails, you are not charged.`
            : "This is free."
        }
        confirmLabel="Generate"
        onConfirm={generate}
        onClose={() => setConfirming(false)}
      />
    </section>
  );
}

const LABELS: Record<Period, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

function Bullets({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-1 text-xs font-bold uppercase tracking-widest text-ink-soft">{title}</h3>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className={`text-sm ${tone}`}>
            • {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Each failure mode gets the action that actually resolves it. */
function messageFor(status: number, serverMessage?: string): { message: string; action?: { label: string; href: string } } {
  if (status === 402) {
    return {
      message: serverMessage ?? "You do not have enough credits for this.",
      action: { label: "Top up", href: "/dashboard?billing=1&tab=topup" },
    };
  }
  if (status === 409) {
    return { message: serverMessage ?? "Not enough data yet — sync some posts first." };
  }
  if (status === 429) {
    return { message: "You have generated a lot of summaries recently. Try again in a little while." };
  }
  if (status === 502) {
    return { message: serverMessage ?? "Generation failed — you were not charged. Try again." };
  }
  return { message: serverMessage ?? "Something went wrong. Try again." };
}
