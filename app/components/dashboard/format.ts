// Domain-free formatters for dashboard tiles.
//
// `inr` deliberately stayed in app/admin/dashboard/ui.tsx: paise-to-₹ is
// billing domain, and nothing outside admin should be formatting money.

export const compact = (n: number | null | undefined) =>
  n == null ? "—" : Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export const pct = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(1)}%`);

export function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
