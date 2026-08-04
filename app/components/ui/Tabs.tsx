"use client";

// In-page tabs with a correct ARIA contract.
//
// The v1 Social Tracker had `role="tab"` buttons with no tabpanel, no
// aria-controls and no roving tabindex — a BROKEN contract, which is worse than
// no contract at all: it promises a screen reader arrow-key navigation that
// does not exist and panels that are not wired up. This primitive exists so
// nobody has to hand-roll that again.
//
// The full pattern, in one place:
//   • tablist owns arrow-key navigation, Home and End
//   • exactly one tab is tabbable at a time (roving tabindex)
//   • every tab has aria-selected and aria-controls
//   • every panel has role="tabpanel", aria-labelledby, and is focusable
//
// For tabs that are really NAVIGATION between routes, use links instead — see
// TabsNav in the Social Tracker. Tabs that change the URL are not tabs.

import { useId, useRef, useState, type ReactNode } from "react";

export interface TabItem {
  id: string;
  label: string;
  /** Rendered when the tab is active. */
  content: ReactNode;
  /** Small count or dot after the label. */
  badge?: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  defaultId?: string;
  label: string;
  className?: string;
  onChange?: (id: string) => void;
}

export function Tabs({ items, defaultId, label, className = "", onChange }: TabsProps) {
  const base = useId();
  const [active, setActive] = useState(defaultId ?? items[0]?.id);
  const refs = useRef(new Map<string, HTMLButtonElement>());

  if (items.length === 0) return null;
  const activeIndex = Math.max(0, items.findIndex((i) => i.id === active));

  const select = (index: number, focus = true) => {
    const next = items[(index + items.length) % items.length];
    setActive(next.id);
    onChange?.(next.id);
    if (focus) refs.current.get(next.id)?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = {
      ArrowRight: activeIndex + 1,
      ArrowLeft: activeIndex - 1,
      Home: 0,
      End: items.length - 1,
    };
    const next = keys[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(next);
  };

  return (
    <div className={className}>
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex gap-1 border-b border-card-border">
        {items.map((item, i) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              ref={(el) => {
                if (el) refs.current.set(item.id, el);
                else refs.current.delete(item.id);
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${item.id}`}
              // Roving tabindex: Tab reaches the tablist once, then arrow keys
              // move within it. Making every tab tabbable is the mistake that
              // turns a 6-tab strip into 6 stops on the way to the content.
              tabIndex={selected ? 0 : -1}
              onClick={() => select(i, false)}
              className={`-mb-px rounded-t-lg px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                selected
                  ? "border-b-2 border-brand text-brand"
                  : "border-b-2 border-transparent text-ink-soft hover:text-ink"
              }`}
            >
              {item.label}
              {item.badge != null && <span className="ml-1.5 text-xs font-normal opacity-80">{item.badge}</span>}
            </button>
          );
        })}
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${base}-panel-${item.id}`}
          aria-labelledby={`${base}-tab-${item.id}`}
          // Focusable so that tabbing out of the tablist lands in the panel
          // rather than skipping past the content the tab just revealed.
          tabIndex={0}
          hidden={item.id !== active}
          className="pt-4 focus-visible:outline-none"
        >
          {item.id === active && item.content}
        </div>
      ))}
    </div>
  );
}
