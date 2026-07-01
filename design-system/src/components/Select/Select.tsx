import * as React from "react";
import { cx } from "../../utils/cx";
import { ChevronDownIcon } from "../../icons";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  label?: string;
  error?: string;
  options: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, id, options, className = "", ...props },
  ref,
) {
  const selectId = id ?? React.useId();
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5 dark:text-zinc-400">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          className={cx(
            "w-full appearance-none bg-gray-50 border rounded-xl px-4 py-3 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-transparent transition-all",
            "dark:bg-zinc-900 dark:text-zinc-100",
            error ? "border-danger" : "border-gray-200 dark:border-zinc-700",
            className,
          )}
          aria-invalid={!!error}
          {...props}
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-danger">{error}</p>}
    </div>
  );
});
