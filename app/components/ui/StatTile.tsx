export type StatAccent = "blue" | "violet" | "fuchsia" | "emerald";

interface StatTileProps {
  label: string;
  value: number | string;
  accent?: StatAccent;
}

const ACCENT: Record<StatAccent, string> = {
  blue: "bg-tint-blue border-tint-blue-border",
  violet: "bg-tint-violet border-tint-violet-border",
  fuchsia: "bg-tint-fuchsia border-tint-fuchsia-border",
  emerald: "bg-tint-emerald border-tint-emerald-border",
};

export function StatTile({ label, value, accent = "blue" }: StatTileProps) {
  return (
    <div className={`rounded-[var(--radius-card)] border px-4 py-3.5 ${ACCENT[accent]}`}>
      <p className="text-[10px] font-bold text-ink-soft uppercase tracking-widest">{label}</p>
      <p className="text-xl font-extrabold grad-text inline-block mt-1">{value}</p>
    </div>
  );
}
