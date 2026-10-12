// The address a purged account's User row is left with (lib/account-deletion.ts).
// Kept dependency-free so the email sender can recognise one without importing
// the deletion core. `.invalid` is reserved (RFC 2606) and can never resolve,
// so nothing addressed here can reach a real mailbox even if a send slips by.

export const TOMBSTONE_EMAIL_DOMAIN = "deleted.clipiro.invalid";

export function tombstoneEmail(userId: string): string {
  return `deleted-${userId}@${TOMBSTONE_EMAIL_DOMAIN}`;
}

export function isTombstoneEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${TOMBSTONE_EMAIL_DOMAIN}`);
}
