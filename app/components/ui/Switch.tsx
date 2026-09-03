// Toggle switch for the vibrant-gradient design system — replaces the
// hand-rolled `w-10 h-6 rounded-full` pattern repeated across the app.

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? "grad-brand" : "bg-card-border"} ${disabled ? "opacity-50 pointer-events-none" : ""}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-panel shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
    </button>
  );
}
