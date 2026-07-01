import * as React from "react";
import { cx } from "../../utils/cx";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Error message — renders below the field and switches the border to danger. */
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, id, className = "", ...props },
  ref,
) {
  const inputId = id ?? React.useId();
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5 dark:text-zinc-400">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={cx(
          "w-full bg-gray-50 border rounded-xl px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-transparent transition-all",
          "dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500",
          error ? "border-danger" : "border-gray-200 dark:border-zinc-700",
          className,
        )}
        aria-invalid={!!error}
        {...props}
      />
      {error && <p className="mt-1.5 text-xs font-medium text-danger">{error}</p>}
    </div>
  );
});
