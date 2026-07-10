// Shared display formatters — deduped from the profile pages
// (my-videos, credits, payment-history, receipt) and billing.

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatINR(paise: number) {
  return `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
}
