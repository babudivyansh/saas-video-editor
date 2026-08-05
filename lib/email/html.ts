// Safe interpolation for email bodies.
//
// The old templates interpolated user-controlled values straight into HTML
// strings — a referral name, a review rejection reason, a bank decline message,
// a social account's display name. A name containing markup was an injection
// into the email body, and there was no escape helper anywhere in the repo to
// reach for.
//
// The fix is a tagged template that escapes by default. The part worth
// understanding is that it produces BOTH representations in one pass:
//
//   html`Hi <strong>${name}</strong>`
//     .html -> "Hi <strong>Bob &amp; Co</strong>"
//     .text -> "Hi Bob & Co"
//
// That is what makes the plain-text part of every email free rather than 35
// hand-written bodies, and it makes the two parts structurally incapable of
// drifting apart — there is no HTML-to-text parser in the middle to disagree.

/**
 * A string that has already been made safe for both output formats.
 *
 * Only `html` and `raw` construct these, so a plain `string` reaching a renderer
 * is always still-untrusted and always gets escaped.
 */
export class SafeHtml {
  constructor(
    readonly html: string,
    readonly text: string,
  ) {}

  toString(): string {
    return this.html;
  }
}

/** Escapes the five characters that can break out of text or an attribute. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Mark a string as pre-escaped.
 *
 * The audited escape hatch — deliberately named so `grep -rn "raw(" lib/email`
 * lists every place trust was asserted. Never call this on a value that came
 * from the database or a request.
 */
export function raw(trusted: string): SafeHtml {
  return new SafeHtml(trusted, trusted);
}

/**
 * Constrain a URL to schemes that are safe in an email client.
 *
 * `javascript:` and `data:` are the ones that matter; some clients still honour
 * them. Anything unrecognised collapses to "#" rather than being passed through,
 * because a broken link in an email is recoverable and a live one is not.
 */
export function safeUrl(href: string): string {
  const trimmed = href.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return escapeHtml(trimmed);
  // Site-relative links are fine and are used by a few templates.
  if (trimmed.startsWith("/")) return escapeHtml(trimmed);
  return "#";
}

function interpolate(value: unknown): SafeHtml {
  if (value === null || value === undefined) return new SafeHtml("", "");
  if (value instanceof SafeHtml) return value;
  if (Array.isArray(value)) {
    const parts = value.map(interpolate);
    return new SafeHtml(parts.map((p) => p.html).join(""), parts.map((p) => p.text).join(""));
  }
  const asString = String(value);
  return new SafeHtml(escapeHtml(asString), asString);
}

/**
 * The tagged template every template file uses.
 *
 * Literal chunks are trusted (they are source code); interpolated values are
 * not. The text side keeps the literal chunks too, which is why simple inline
 * markup like <strong> has to be stripped there — see stripTags.
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let outHtml = "";
  let outText = "";

  strings.forEach((chunk, i) => {
    outHtml += chunk;
    outText += stripTags(chunk);
    if (i < values.length) {
      const v = interpolate(values[i]);
      outHtml += v.html;
      outText += v.text;
    }
  });

  return new SafeHtml(outHtml, outText);
}

/**
 * Remove the small amount of inline markup templates use in their literal
 * chunks (<strong>, <em>, <br/>) so the text part reads as prose.
 *
 * Only ever applied to LITERAL chunks — never to interpolated values, which are
 * already plain text on the text side. So this cannot be used to smuggle
 * anything: an attacker controls values, not source.
 */
function stripTags(literal: string): string {
  return literal
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "");
}

/** Join SafeHtml pieces, preserving both representations. */
export function joinSafe(parts: SafeHtml[], separatorHtml = "", separatorText = ""): SafeHtml {
  return new SafeHtml(
    parts.map((p) => p.html).join(separatorHtml),
    parts.map((p) => p.text).join(separatorText),
  );
}

/** Coerce a template field that may be either form into SafeHtml. */
export function toSafe(value: string | SafeHtml): SafeHtml {
  return value instanceof SafeHtml ? value : new SafeHtml(escapeHtml(value), value);
}
