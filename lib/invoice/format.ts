// Display helpers shared by the invoice PDF and the receipt page, so the two
// renderings of one invoice can never format it differently. Client-safe.

import { stateName } from "./gst";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** "25 Sep 2026" in IST. Hand-rolled: ICU renders en-GB September as "Sept". */
export function formatInvoiceDate(at: Date | string): string {
  const ist = new Date(new Date(at).getTime() + IST_OFFSET_MS);
  return `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
}

/** "Uttar Pradesh (09)". */
export function stateLabel(code: string | null | undefined): string {
  if (!code) return "";
  const name = stateName(code);
  return name ? `${name} (${code})` : code;
}

/** "B1-1208, Futech Gateway, Sector-75" / "Noida, Uttar Pradesh 201301, India". */
export function addressLines(address: string): string[] {
  const parts = address.split(", ");
  return parts.length > 3 ? [parts.slice(0, 3).join(", "), parts.slice(3).join(", ")] : [address];
}
