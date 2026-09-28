// Input rules shared by every route that accepts a name, email or password,
// so register, reset-password, change-password and profile can't drift into
// four slightly different ideas of "valid".

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const NAME_MAX = 60;
export const PASSWORD_MIN = 8;
// bcrypt only hashes the first 72 bytes and silently ignores the rest, so a
// longer password would appear to work while most of it did nothing.
export const PASSWORD_MAX_BYTES = 72;

export function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

/** Trimmed, control characters stripped, inner whitespace collapsed. "" when unusable. */
export function cleanName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
}

/** Returns an error message, or null when the name is acceptable. */
export function validateName(name: string): string | null {
  if (!name) return "Enter your name";
  if (name.length > NAME_MAX) return `Name must be ${NAME_MAX} characters or fewer`;
  return null;
}

/** Returns an error message, or null when the password is acceptable. */
export function validatePassword(password: unknown): string | null {
  if (typeof password !== "string" || password.length < PASSWORD_MIN) {
    return `Password must be at least ${PASSWORD_MIN} characters`;
  }
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) {
    return `Password must be ${PASSWORD_MAX_BYTES} characters or fewer`;
  }
  return null;
}
