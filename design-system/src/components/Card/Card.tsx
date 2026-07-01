import * as React from "react";
import { cx } from "../../utils/cx";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Matches the app's "most popular" pricing-card treatment: filled primary background, scaled up, deeper shadow. */
  highlighted?: boolean;
}

export function Card({ highlighted = false, className = "", children, ...props }: CardProps) {
  return (
    <div
      className={cx(
        "rounded-2xl p-8 border-2 transition-all",
        highlighted
          ? "border-primary bg-primary text-white shadow-2xl md:scale-105"
          : "border-gray-100 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
