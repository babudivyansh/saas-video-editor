import * as React from "react";
import { cx } from "../../utils/cx";

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
  /** "accent" is reserved for Veo3-only contexts, matching the app's purple checkbox convention. */
  tone?: "primary" | "accent";
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, tone = "primary", id, className = "", ...props },
  ref,
) {
  const checkboxId = id ?? React.useId();
  return (
    <label htmlFor={checkboxId} className="flex items-start gap-2.5 cursor-pointer">
      <input
        ref={ref}
        type="checkbox"
        id={checkboxId}
        className={cx("mt-0.5 w-4 h-4 flex-shrink-0", tone === "accent" ? "accent-accent" : "accent-primary", className)}
        {...props}
      />
      {label && <span className="text-sm text-gray-700 dark:text-zinc-300">{label}</span>}
    </label>
  );
});
