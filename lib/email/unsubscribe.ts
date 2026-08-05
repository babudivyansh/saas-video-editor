// Signed unsubscribe tokens for lifecycle email.
//
// Modelled directly on lib/reviews/email-track-token.ts: reuses lib/auth.ts's
// JWT secret rather than inventing new crypto or another env var, and carries a
// distinct `purpose` claim with NO `sessionId`. That second part is the security
// property that matters — even if one of these were routed through the real
// session path (getAuthUser), it would be rejected there, because that function
// returns null for any token without a sessionId (lib/auth.ts:176).
//
// The existing NewsletterSubscriber.token already covers newsletter opt-out and
// is untouched; this covers the eight NotificationPreference categories, which
// had no unsubscribe mechanism at all. No new table, no migration.
//
// NOTE: this module DOES import lib/env (for JWT_SECRET), so it must stay out of
// the render layer's import graph. layout.ts receives a finished `unsubscribeUrl`
// string and never mints one — that is what keeps templates env-free and
// unit-testable.

import jwt from "jsonwebtoken";
import { env } from "@/lib/env";
import type { NotificationCategory } from "@/lib/notifications";
import { APP_URL } from "./tokens";

const PURPOSE = "email-unsub";

/** A year: long enough that an unsubscribe link never dies before the email does. */
const TTL = "365d";

interface UnsubPayload {
  userId: string;
  category: NotificationCategory;
  purpose: typeof PURPOSE;
}

export function signUnsubToken(userId: string, category: NotificationCategory): string {
  const payload: UnsubPayload = { userId, category, purpose: PURPOSE };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: TTL });
}

export function verifyUnsubToken(token: string): { userId: string; category: NotificationCategory } | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as Partial<UnsubPayload>;
    if (payload.purpose !== PURPOSE || !payload.userId || !payload.category) return null;
    return { userId: payload.userId, category: payload.category };
  } catch {
    return null;
  }
}

export function unsubscribeUrl(userId: string, category: NotificationCategory): string {
  const token = signUnsubToken(userId, category);
  return `${APP_URL}/api/email/unsubscribe?t=${encodeURIComponent(token)}`;
}
