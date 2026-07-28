"use client";

import { Dropdown, DropdownItem } from "@/app/components/ui/Dropdown";
import { Input } from "@/app/components/ui/Field";
import { FEATURE_USED_OPTIONS, type ReviewSortOption } from "@/lib/reviews/constants";

const SORT_LABEL: Record<ReviewSortOption, string> = {
  recent: "Newest",
  helpful: "Most helpful",
  rating_high: "Highest rated",
  rating_low: "Lowest rated",
};

function IcChevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5">
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface ReviewFiltersProps {
  sort: ReviewSortOption;
  onSortChange: (sort: ReviewSortOption) => void;
  feature: string | null;
  onFeatureChange: (feature: string | null) => void;
  rating: number | null;
  onRatingChange: (rating: number | null) => void;
  search: string;
  onSearchChange: (search: string) => void;
}

export function ReviewFilters({
  sort, onSortChange, feature, onFeatureChange, rating, onRatingChange, search, onSearchChange,
}: ReviewFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search reviews…"
          aria-label="Search reviews"
        />
      </div>

      <Dropdown
        trigger={({ toggle, open }) => (
          <button
            onClick={toggle}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink bg-white border border-card-border rounded-full px-4 py-2 hover:bg-tint-blue transition-colors cursor-pointer"
          >
            {SORT_LABEL[sort]} <IcChevron />
          </button>
        )}
      >
        {({ close }) => (
          <div className="py-1.5">
            {(Object.keys(SORT_LABEL) as ReviewSortOption[]).map((opt) => (
              <DropdownItem key={opt} onClick={() => { onSortChange(opt); close(); }}>
                {SORT_LABEL[opt]}
              </DropdownItem>
            ))}
          </div>
        )}
      </Dropdown>

      <Dropdown
        trigger={({ toggle }) => (
          <button
            onClick={toggle}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink bg-white border border-card-border rounded-full px-4 py-2 hover:bg-tint-blue transition-colors cursor-pointer"
          >
            {feature ? FEATURE_USED_OPTIONS.find((o) => o.value === feature)?.label : "Feature"} <IcChevron />
          </button>
        )}
      >
        {({ close }) => (
          <div className="py-1.5">
            <DropdownItem onClick={() => { onFeatureChange(null); close(); }}>All features</DropdownItem>
            {FEATURE_USED_OPTIONS.map((opt) => (
              <DropdownItem key={opt.value} onClick={() => { onFeatureChange(opt.value); close(); }}>
                {opt.label}
              </DropdownItem>
            ))}
          </div>
        )}
      </Dropdown>

      <Dropdown
        trigger={({ toggle }) => (
          <button
            onClick={toggle}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink bg-white border border-card-border rounded-full px-4 py-2 hover:bg-tint-blue transition-colors cursor-pointer"
          >
            {rating ? `${rating} star${rating === 1 ? "" : "s"}` : "Rating"} <IcChevron />
          </button>
        )}
      >
        {({ close }) => (
          <div className="py-1.5">
            <DropdownItem onClick={() => { onRatingChange(null); close(); }}>All ratings</DropdownItem>
            {[5, 4, 3, 2, 1].map((star) => (
              <DropdownItem key={star} onClick={() => { onRatingChange(star); close(); }}>
                {star} star{star === 1 ? "" : "s"}
              </DropdownItem>
            ))}
          </div>
        )}
      </Dropdown>
    </div>
  );
}
