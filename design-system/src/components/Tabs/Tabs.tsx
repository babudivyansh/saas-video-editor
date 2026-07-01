import * as React from "react";
import { cx } from "../../utils/cx";

export interface TabItem {
  value: string;
  label: React.ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/** Segmented-control tabs, matching the pricing page's Monthly/Yearly term toggle. */
export function Tabs({ items, value, onChange, className = "" }: TabsProps) {
  return (
    <div className={cx("inline-flex items-center gap-1 rounded-full bg-gray-100 p-1 dark:bg-zinc-800", className)} role="tablist">
      {items.map(item => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cx(
              "px-4 py-2 text-sm font-semibold rounded-full transition-colors",
              active ? "bg-primary text-white" : "text-gray-600 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-zinc-100",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
