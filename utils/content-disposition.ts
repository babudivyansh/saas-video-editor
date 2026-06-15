/**
 * Build a Content-Disposition header that is safe for HTTP (ByteString-only)
 * even when the filename contains non-Latin1 characters (emoji, CJK, etc.).
 *
 * HTTP header values cannot hold code points > 255, so we provide:
 *   - filename="..."  → an ASCII-sanitized fallback for legacy clients
 *   - filename*=UTF-8''... → the real, percent-encoded UTF-8 name (RFC 5987)
 */
export function attachmentDisposition(filename: string): string {
  // ASCII fallback: drop anything outside printable Latin1, collapse the gaps.
  const asciiName = filename
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/["\\]/g, "")
    .trim() || "download";

  // RFC 5987: percent-encode the full UTF-8 name.
  const encoded = encodeURIComponent(filename);

  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encoded}`;
}
