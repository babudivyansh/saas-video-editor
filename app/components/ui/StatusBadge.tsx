// Small status chip on the semantic tokens. Admin tables hand-rolled these
// with light-theme pastel classes (the *-50 fills with *-700 text),
// which render as bright boxes — or dark-on-dark text — on the emerald surfaces.

export type StatusTone = "success" | "warning" | "error" | "info" | "primary" | "neutral";

const TONE: Record<StatusTone, string> = {
  success: "bg-success/10 text-success border-success/25",
  warning: "bg-warning/10 text-warning border-warning/25",
  error: "bg-error/10 text-error border-error/25",
  info: "bg-info/10 text-info border-info/25",
  primary: "bg-primary/10 text-primary border-primary/25",
  neutral: "bg-surface-3 text-fg-muted border-line",
};

export function StatusBadge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${TONE[tone]} ${className}`}>
      {children}
    </span>
  );
}
