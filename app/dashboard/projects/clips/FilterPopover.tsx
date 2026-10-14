"use client";

import { Dropdown } from "@/app/components/ui/Dropdown";
import {
  FLAG_FILTERS, LENGTH_BUCKETS, activeFilterCount,
  type ClipFilters, type FlagFilter, type LengthBucket,
} from "@/lib/clip-view";
import { IcFilter } from "../components/icons";

// The Filter button and its panel: clip flags (Favorited … Not dubbed) and
// clip length buckets. Each row is a menuitemcheckbox, so the menu's arrow
// keys move between them and Space toggles one without closing the panel.

function Row({ checked, label, onToggle }: { checked: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={onToggle}
      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-fg outline-none hover:bg-surface-3 focus-visible:bg-surface-3"
    >
      <span
        aria-hidden
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 ${checked ? "border-transparent bg-primary text-on-primary" : "border-line-strong"}`}
      >
        {checked && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} className="h-3 w-3"><path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        )}
      </span>
      {label}
    </button>
  );
}

export function FilterPopover({ filters, onChange }: { filters: ClipFilters; onChange: (f: ClipFilters) => void }) {
  const count = activeFilterCount(filters);
  const toggleFlag = (id: FlagFilter) =>
    onChange({ ...filters, flags: filters.flags.includes(id) ? filters.flags.filter((f) => f !== id) : [...filters.flags, id] });
  const toggleLength = (id: LengthBucket) =>
    onChange({ ...filters, lengths: filters.lengths.includes(id) ? filters.lengths.filter((l) => l !== id) : [...filters.lengths, id] });

  return (
    <Dropdown
      align="right"
      className="w-56"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 ${
            count ? "border-primary/50 bg-primary/10 text-fg" : "border-line bg-surface-2 text-fg hover:bg-surface-3"
          }`}
        >
          <IcFilter /> Filter{count ? ` · ${count}` : ""}
        </button>
      )}
    >
      {() => (
        <div className="py-1.5" aria-label="Filter clips">
          {FLAG_FILTERS.map((f) => (
            <Row key={f.id} label={f.label} checked={filters.flags.includes(f.id)} onToggle={() => toggleFlag(f.id)} />
          ))}
          <p className="px-3.5 pb-1 pt-3 text-xs font-medium text-fg-subtle">Clip length</p>
          {LENGTH_BUCKETS.map((b) => (
            <Row key={b.id} label={b.label} checked={filters.lengths.includes(b.id)} onToggle={() => toggleLength(b.id)} />
          ))}
          {count > 0 && (
            <button
              type="button"
              role="menuitem"
              onClick={() => onChange({ flags: [], lengths: [] })}
              className="mt-1.5 w-full border-t border-line px-3.5 pb-1 pt-2.5 text-left text-sm text-fg-muted outline-none hover:text-fg focus-visible:text-fg"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </Dropdown>
  );
}
