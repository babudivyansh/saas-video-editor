// Selection checkbox for the main dashboard design system — used by any
// bulk-select grid/list (introduced for the Assets library).

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /**
   * The accessible name. Rendered as visible text only with `showLabel` — by
   * default this is an `aria-label` and nothing more.
   *
   * That default is not an oversight. Most callers sit inside their own <label>
   * or beside their own text ("I allow Clipiro to display my review publicly"),
   * and showing `label` too would print the name twice.
   */
  label?: string;
  /**
   * Render `label` as visible text next to the box.
   *
   * For callers that supply no text of their own. Without it the Social Tracker
   * report builder rendered two rows of bare checkboxes — the accounts and
   * sections were selectable but unreadable, since the names existed only as
   * aria-labels.
   */
  showLabel?: boolean;
  className?: string;
}

const BOX_BASE =
  "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors flex-shrink-0";

function boxClasses(checked: boolean): string {
  return `${BOX_BASE} ${
    checked ? "grad-brand border-transparent" : "bg-white/90 border-card-border hover:border-violet-300"
  }`;
}

function Tick() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} className="w-3 h-3">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Checkbox({ checked, onChange, label, showLabel = false, className = "" }: CheckboxProps) {
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(!checked);
  };

  // One control containing both the box and the text, rather than a button
  // beside a clickable <span>. role="checkbox" is not a labelable element, so an
  // enclosing <label> would not forward clicks, and a span with onClick is a
  // mouse-only target. Here the text is inside the button: it reads as the
  // accessible name and it is part of the hit area.
  if (label && showLabel) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={toggle}
        className={`inline-flex items-center gap-2 text-sm text-ink cursor-pointer ${className}`}
      >
        <span aria-hidden="true" className={boxClasses(checked)}>
          {checked && <Tick />}
        </span>
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={toggle}
      className={`${boxClasses(checked)} cursor-pointer ${className}`}
    >
      {checked && <Tick />}
    </button>
  );
}
