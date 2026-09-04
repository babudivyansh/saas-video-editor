"use client";

// A 0–100 score as an arc — account health, viral score, consistency.
//
// It carries `confidence` because these scores are computed from components
// that are often partly missing (lib/social/metrics/scores.ts redistributes the
// weight and says so). A gauge that renders 62/100 identically whether it was
// computed from five components or two is lying by omission.

import { fmtPct } from "./format";

const SIZE = 140;
const R = 56;
const STROKE = 14;
/** Three-quarter arc: a full ring reads as a pie, a half reads as a speedometer. */
const SWEEP = 270;

export interface GaugeProps {
  label: string;
  /** 0–100. Null renders the empty track and "not enough data". */
  value: number | null;
  /** 0–1 fraction of the weighting that had data. */
  confidence?: number | null;
  /** Component breakdown, so the number is explainable rather than asserted. */
  components?: Array<{ label: string; value: number | null }>;
  className?: string;
}

const LOW = 40;
const HIGH = 70;

/** Band colours come from the design tokens, not from a red/amber/green guess. */
function bandColor(value: number): string {
  if (value >= HIGH) return "var(--brand-fuchsia, #d946ef)";
  if (value >= LOW) return "var(--brand-violet, #7c3aed)";
  return "var(--brand, #335cff)";
}

export function Gauge({ label, value, confidence = null, components = [], className = "" }: GaugeProps) {
  const arcLength = (SWEEP / 360) * 2 * Math.PI * R;
  const filled = value === null ? 0 : (Math.max(0, Math.min(100, value)) / 100) * arcLength;
  const gap = 2 * Math.PI * R - arcLength;

  return (
    <figure
      className={`rounded-[var(--radius-card)] border border-card-border bg-panel p-4 shadow-card ${className}`}
    >
      <figcaption className="text-sm font-semibold text-ink">{label}</figcaption>

      <div className="mt-2 flex flex-wrap items-center gap-4">
        <div className="relative flex-shrink-0">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-32 w-32" role="presentation">
            {/* Rotated so the 270° arc opens at the bottom, symmetrically. */}
            <g transform={`rotate(135 ${SIZE / 2} ${SIZE / 2})`}>
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke="var(--surface, #f4f5f7)"
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={`${arcLength} ${gap}`}
              />
              {value !== null && (
                <circle
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={R}
                  fill="none"
                  stroke={bandColor(value)}
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={`${filled} ${2 * Math.PI * R - filled}`}
                />
              )}
            </g>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-extrabold text-ink">
              {value === null ? "—" : Math.round(value)}
            </span>
            {value !== null && <span className="text-[10px] text-ink-soft">out of 100</span>}
          </div>
        </div>

        <div className="min-w-[8rem] flex-1">
          {value === null ? (
            <p className="text-xs text-ink-soft">Not enough data yet to score this account.</p>
          ) : (
            <>
              {components.length > 0 && (
                <ul className="space-y-1">
                  {components.map((c) => (
                    <li key={c.label} className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="text-ink-soft">{c.label}</span>
                      <span className="font-semibold tabular-nums text-ink">
                        {c.value === null ? "no data" : Math.round(c.value)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {confidence !== null && confidence < 1 && (
                <p className="mt-2 text-[11px] text-ink-soft">
                  Based on {fmtPct(confidence * 100)} of the usual inputs — the rest are not
                  reported for this account.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </figure>
  );
}
