"use client";

import { useEffect, useRef, useState } from "react";
import { ReviewCard } from "@/app/components/reviews/ReviewCard";
import { ReviewFilters } from "@/app/components/reviews/ReviewFilters";
import { RatingSummary } from "@/app/components/reviews/RatingSummary";
import { Button } from "@/app/components/ui/Button";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { SkeletonGrid } from "@/app/components/ui/Skeleton";
import type { ReviewSortOption } from "@/lib/reviews/constants";
import type { PublicReviewDTO, ReviewSummary } from "@/lib/reviews/queries";

interface ReviewsPageClientProps {
  initialItems: PublicReviewDTO[];
  initialSummary: ReviewSummary;
  initialNextCursor: string | null;
}

function IcStar() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
      <path d="M12 2.5l2.95 6.28 6.8.79-5.1 4.7 1.4 6.73L12 17.6l-6.05 3.4 1.4-6.73-5.1-4.7 6.8-.79L12 2.5z" />
    </svg>
  );
}

export function ReviewsPageClient({ initialItems, initialSummary, initialNextCursor }: ReviewsPageClientProps) {
  const [items, setItems] = useState(initialItems);
  const [summary, setSummary] = useState(initialSummary);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [sort, setSort] = useState<ReviewSortOption>("recent");
  const [feature, setFeature] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestId = useRef(0);

  async function fetchReviews(cursor: string | null) {
    const params = new URLSearchParams();
    params.set("sort", sort);
    if (feature) params.set("feature", feature);
    if (rating) params.set("rating", String(rating));
    if (search.trim()) params.set("search", search.trim());
    if (cursor) params.set("cursor", cursor);

    const id = ++requestId.current;
    const res = await fetch(`/api/reviews?${params.toString()}`);
    if (id !== requestId.current) return; // a newer filter change superseded this request
    if (!res.ok) return;
    const data = await res.json();
    setSummary(data.summary);
    setNextCursor(data.nextCursor);
    return data.items as PublicReviewDTO[];
  }

  // Refetch from scratch whenever a filter changes — skips the very first
  // render since that data already came from the server component.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    setLoading(true);
    fetchReviews(null).then((newItems) => {
      if (newItems) setItems(newItems);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, feature, rating]);

  // Debounced search — waits for the user to stop typing.
  useEffect(() => {
    if (isFirstRender.current) return;
    const timer = setTimeout(() => {
      setLoading(true);
      fetchReviews(null).then((newItems) => {
        if (newItems) setItems(newItems);
        setLoading(false);
      });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    const newItems = await fetchReviews(nextCursor);
    if (newItems) setItems((prev) => [...prev, ...newItems]);
    setLoadingMore(false);
  }

  return (
    <div className="space-y-8">
      <div className="rounded-[var(--radius-card)] border border-card-border bg-white p-6">
        <RatingSummary summary={summary} />
      </div>

      <ReviewFilters
        sort={sort} onSortChange={setSort}
        feature={feature} onFeatureChange={setFeature}
        rating={rating} onRatingChange={setRating}
        search={search} onSearchChange={setSearch}
      />

      {loading ? (
        <SkeletonGrid count={6} />
      ) : items.length === 0 ? (
        <EmptyState icon={<IcStar />} title="No reviews match your filters" subtitle="Try a different sort or filter." />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map((review) => <ReviewCard key={review.id} review={review} />)}
          </div>
          {nextCursor && (
            <div className="flex justify-center">
              <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more reviews"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
