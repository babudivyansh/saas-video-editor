// One inbox, many spellings. Gmail ignores dots and everything after "+" in
// the local part, and most providers ignore "+tag" — so "a.b+1@gmail.com" and
// "ab@gmail.com" reach the same person. The stored email stays exactly as
// typed (it is what we send to); this key only answers "has this inbox been
// here before?" for one-per-person offers: the signup bonus and the Pro trial.

const DOT_INSENSITIVE = new Set(["gmail.com", "googlemail.com"]);

export function canonicalEmail(email: string): string {
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf("@");
  if (at <= 0) return lower;
  let local = lower.slice(0, at);
  let domain = lower.slice(at + 1);
  local = local.split("+")[0];
  if (DOT_INSENSITIVE.has(domain)) {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }
  return `${local}@${domain}`;
}

// Throwaway-inbox services. Not exhaustive — new ones appear daily — but these
// are the ones that show up in signup abuse, and the cost of a false positive
// is a person being asked for a permanent address.
const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com", "20minutemail.com", "33mail.com", "anonaddy.me", "burnermail.io",
  "byom.de", "discard.email", "dispostable.com", "dropmail.me", "emailondeck.com",
  "fakeinbox.com", "fakemail.net", "getairmail.com", "getnada.com", "guerrillamail.com",
  "guerrillamail.net", "guerrillamail.org", "guerrillamailblock.com", "harakirimail.com",
  "inboxbear.com", "inboxkitten.com", "jetable.org", "mail.tm", "mailcatch.com",
  "maildrop.cc", "mailinator.com", "mailinator.net", "mailnesia.com", "mailpoof.com",
  "mintemail.com", "moakt.com", "mohmal.com", "mytemp.email", "nada.email", "sharklasers.com",
  "spam4.me", "spamgourmet.com", "temp-mail.io", "temp-mail.org", "tempail.com",
  "tempinbox.com", "tempmail.dev", "tempmail.net", "tempmailo.com", "tempr.email",
  "throwawaymail.com", "trashmail.com", "trashmail.de", "trashmail.net", "yopmail.com",
  "yopmail.fr", "yopmail.net",
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@").pop() ?? "";
  return DISPOSABLE_DOMAINS.has(domain);
}
