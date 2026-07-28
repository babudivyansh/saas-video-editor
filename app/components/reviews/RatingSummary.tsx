import { StarRating } from "@/app/components/reviews/StarRating";
import type { ReviewSummary } from "@/lib/reviews/queries";

interface RatingSummaryProps {
  summary: ReviewSummary;
}

// Hand-rolled percentage bars — matches this app's existing no-charting-
// library precedent for simple, single-series visualizations (see
// UsageBarChart.tsx).
function RatingDistributionBar({ star, count, total }: { star: number; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-3 text-ink-soft font-medium">{star}</span>
      <div className="flex-1 h-2 rounded-full bg-surface overflow-hidden">
        <div
          className="h-full rounded-full grad-brand transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-ink-soft">{count}</span>
    </div>
  );
}

export function RatingSummary({ summary }: RatingSummaryProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-6 sm:gap-10 items-start">
      <div className="flex flex-col items-center flex-shrink-0">
        <p className="text-5xl font-extrabold grad-text">{summary.average.toFixed(1)}</p>
        <StarRating value={Math.round(summary.average)} readOnly size="md" className="mt-1.5" />
        <p className="text-xs text-ink-soft mt-1.5">
          {summary.count} review{summary.count === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex-1 w-full space-y-1.5">
        {([5, 4, 3, 2, 1] as const).map((star) => (
          <RatingDistributionBar
            key={star}
            star={star}
            count={summary.distribution[String(star) as keyof typeof summary.distribution]}
            total={summary.count}
          />
        ))}
      </div>
    </div>
  );
}
