// Selection checkbox for the main dashboard design system — used by any
// bulk-select grid/list (introduced for the Assets library).

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  className?: string;
}

export function Checkbox({ checked, onChange, label, className = "" }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0 ${
        checked ? "grad-brand border-transparent" : "bg-white/90 border-card-border hover:border-violet-300"
      } ${className}`}
    >
      {checked && (
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} className="w-3 h-3">
          <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
