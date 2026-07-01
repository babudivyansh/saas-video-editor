import * as React from "react";
import { cx } from "../../utils/cx";

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0–100 */
  value: number;
}

export function ProgressBar({ value, className = "", ...props }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cx("w-full h-2 rounded-full bg-gray-100 overflow-hidden dark:bg-zinc-800", className)}
      {...props}
    >
      <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${clamped}%` }} />
    </div>
  );
}
