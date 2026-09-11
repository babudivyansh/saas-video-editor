"use client";

// "Why did this move?" for one KPI tile.
//
// The cheapest of the six AI tools to expose and the most obviously useful:
// it costs 0 credits, it is a cached GET, and lib/social/ai's deterministic
// template answers most calls without reaching a model at all — unavailable
// metrics, missing data, flat periods, and movements that track a known
// driver. Only the genuinely unexplained ones cost a call, and those are
// cached 24h under a key built from ROUNDED deltas, so an idle dashboard never
// re-asks.
//
// Because it is free, it is fetched ON DEMAND rather than eagerly: one request
// per question actually asked, not one per tile rendered.

import { useCallback, useId, useRef, useState } from "react";
import type { KpiExplanation } from "@/lib/social/ai/schemas";
import { SocialApiError, useSocialApi } from "./useSocialApi";

type State =
  | { kind: "closed" }
  | { kind: "loading" }
  | { kind: "ready"; explanation: KpiExplanation }
  | { kind: "error"; message: string };

const CONFIDENCE_TONE: Record<string, string> = {
  high: "text-success",
  medium: "text-fg-muted",
  low: "text-warning",
};

export function KpiExplain({
  accountId,
  metric,
  label,
  range,
  tz,
}: {
  /** Omitted for a portfolio view — an explanation is per account. */
  accountId: string | null;
  metric: string;
  label: string;
  range: number;
  tz: string;
}) {
  const api = useSocialApi();
  const [state, setState] = useState<State>({ kind: "closed" });
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const open = useCallback(async () => {
    if (!accountId) return;
    setState({ kind: "loading" });
    try {
      const qs = new URLSearchParams({ accountId, metric, range: String(range), tz });
      const data = await api<{ explanation: KpiExplanation }>(`/api/social/kpi-explain?${qs}`);
      setState({ kind: "ready", explanation: data.explanation });
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof SocialApiError ? e.message : "Couldn't explain this one.",
      });
    }
  }, [api, accountId, metric, range, tz]);

  // Nothing to explain about a figure summed across accounts — the drivers
  // differ per account and a merged answer would describe none of them.
  if (!accountId) return null;

  const isOpen = state.kind !== "closed";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (isOpen ? setState({ kind: "closed" }) : void open())}
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        className="cursor-pointer rounded text-[10px] font-semibold text-fg-subtle underline decoration-dotted underline-offset-2 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        Why?
        <span className="sr-only"> — explain the change in {label}</span>
      </button>

      {isOpen && (
        <div
          id={panelId}
          role="region"
          aria-label={`Why ${label} changed`}
          className="mt-2 rounded-xl border border-line bg-surface-3 p-3"
        >
          {state.kind === "loading" && (
            <p className="text-[11px] text-fg-subtle" role="status">
              Working it out…
            </p>
          )}

          {state.kind === "error" && (
            <p className="text-[11px] text-warning" role="alert">
              {state.message}
            </p>
          )}

          {state.kind === "ready" && (
            <>
              <p className="text-xs font-semibold text-fg">{state.explanation.headline}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">
                {state.explanation.detail}
              </p>
              {/* Stated, not implied. A confident guess and a shaky one should
                  not look the same. */}
              <p
                className={`mt-1.5 text-[10px] font-semibold uppercase tracking-wide ${
                  CONFIDENCE_TONE[state.explanation.confidence] ?? "text-fg-subtle"
                }`}
              >
                {state.explanation.confidence} confidence
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
}
