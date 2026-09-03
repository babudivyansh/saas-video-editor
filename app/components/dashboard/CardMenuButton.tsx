"use client";

// Hover-revealed "..." trigger for a project card, matching the affordance
// used on asset cards (app/dashboard/assets/components/AssetCard.tsx).
//
// Always rendered (not conditionally mounted on hover) so it stays reachable
// by keyboard and on touch, where there is no hover at all — it is only the
// opacity that is hover-driven, and focus-visible brings it back.

interface CardMenuButtonProps {
  onClick: (e: React.MouseEvent) => void;
  label: string;
}

export function CardMenuButton({ onClick, label }: CardMenuButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-white/90 border border-card-border shadow-sm flex items-center justify-center text-fg-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-panel transition-opacity cursor-pointer"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
      </svg>
    </button>
  );
}
