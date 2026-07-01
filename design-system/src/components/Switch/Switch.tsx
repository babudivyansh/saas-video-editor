import * as React from "react";
import { cx } from "../../utils/cx";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Switch({ checked, onChange, label, disabled, className = "" }: SwitchProps) {
  return (
    <label className={cx("inline-flex items-center gap-2.5 cursor-pointer", disabled && "opacity-60 cursor-not-allowed", className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-primary" : "bg-gray-200 dark:bg-zinc-700",
        )}
      >
        <span
          className={cx(
            "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-5" : "translate-x-1",
          )}
        />
      </button>
      {label && <span className="text-sm text-gray-700 dark:text-zinc-300">{label}</span>}
    </label>
  );
}
