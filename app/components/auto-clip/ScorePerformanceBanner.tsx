"use client";
import { useEffect, useState } from "react";

// Surfaces the score-to-engagement loop.
//
// The chain already existed end to end — virality score → ClipPublish →
// Social Tracker metrics → lib/virality-calibration.ts feeding real engagement
// back into the scoring weights — and no competitor documents anything
// equivalent. It has been completely invisible in the product.
//
// Shows the user's OWN numbers, and stays silent until there are enough of
// them: presenting noise as insight is worse than saying nothing.

interface ScorePerformance {
  ready: boolean;
  multiple?: number;
  highAvgViews?: number;
  lowAvgViews?: number;
  sample?: { high: number; low: number };
  thresholds?: { high: number; low: number };
}

export function ScorePerformanceBanner() {
  const [data, setData] = useState<ScorePerformance | null>(null);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    fetch("/api/projects/clips/score-performance", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => { /* purely additive; absence is fine */ });
  }, []);

  if (!data?.ready || !data.multiple || data.multiple < 1.1) return null;

  return (
    <div className="mb-4 rounded-xl border border-green-200 bg-green-50/60 px-4 py-3">
      <p className="text-sm text-green-900">
        <span className="font-semibold">Your clips scoring {data.thresholds?.high}+ averaged {data.multiple}× the views</span>
        {" "}of your clips under {data.thresholds?.low}.
      </p>
      <p className="text-[11px] text-green-800/80 mt-0.5">
        Measured from your own posted clips ({data.sample?.high} high, {data.sample?.low} low) — and fed back into how we score.
      </p>
    </div>
  );
}
