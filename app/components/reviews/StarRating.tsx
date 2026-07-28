"use client";

import { useState } from "react";

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  size?: "sm" | "md" | "lg";
  readOnly?: boolean;
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<StarRatingProps["size"]>, string> = {
  sm: "w-3.5 h-3.5",
  md: "w-5 h-5",
  lg: "w-7 h-7",
};

function StarIcon({ filled, className }: { filled: boolean; className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? "url(#star-grad)" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.5}
    >
      <defs>
        <linearGradient id="star-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--brand)" />
          <stop offset="55%" stopColor="var(--accent-violet)" />
          <stop offset="100%" stopColor="var(--accent-fuchsia)" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.5l2.95 6.28 6.8.79-5.1 4.7 1.4 6.73L12 17.6l-6.05 3.4 1.4-6.73-5.1-4.7 6.8-.79L12 2.5z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StarRating({ value, onChange, size = "md", readOnly = false, className = "" }: StarRatingProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const interactive = !readOnly && !!onChange;
  const display = hovered ?? value;

  return (
    <div
      className={`inline-flex items-center gap-0.5 ${className}`}
      role={interactive ? "radiogroup" : "img"}
      aria-label={interactive ? "Rating" : `${value} out of 5 stars`}
      onMouseLeave={() => setHovered(null)}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          role={interactive ? "radio" : undefined}
          aria-checked={interactive ? value === star : undefined}
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
          tabIndex={interactive ? 0 : -1}
          onClick={() => onChange?.(star)}
          onMouseEnter={() => interactive && setHovered(star)}
          className={`text-ink-soft/30 ${interactive ? "cursor-pointer" : "cursor-default"} transition-transform ${interactive ? "hover:scale-110" : ""}`}
        >
          <StarIcon filled={star <= display} className={SIZE_CLASS[size]} />
        </button>
      ))}
    </div>
  );
}
