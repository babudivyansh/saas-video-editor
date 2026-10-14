/**
 * "alice@gmail.com" → "a***@gmail.com". For showing an affiliate who they
 * referred without handing them the referred user's address — masking happens
 * server-side, so the full email never reaches the affiliate's browser.
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "—";
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}
