import * as React from "react";
import { cx } from "../../utils/cx";

export type SpinnerTone = "light" | "dark";

export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** "light" renders a white spinner for use on filled/colored buttons; "dark" renders a blue spinner for use on light backgrounds. */
  tone?: SpinnerTone;
  size?: "sm" | "md";
}

const toneClasses: Record<SpinnerTone, string> = {
  light: "border-white/30 border-t-white",
  dark: "border-primary/20 border-t-primary",
};

const sizeClasses = {
  sm: "w-4 h-4 border-2",
  md: "w-6 h-6 border-[3px]",
};

export function Spinner({ tone = "dark", size = "sm", className = "", ...props }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cx("inline-block rounded-full animate-spin", toneClasses[tone], sizeClasses[size], className)}
      {...props}
    />
  );
}
