// Narrow-purpose signed token for the review-drip email open/click tracking
// routes, which run with no browser session. Reuses lib/auth.ts's JWT
// signer/secret rather than inventing new crypto or an env var.
//
// Security: deliberately a distinct claim shape from lib/auth.ts's
// TokenPayload ({userId, email, sessionId}) — this token has no `sessionId`,
// so even if it were routed through the real session-auth path
// (getAuthUser), it would be rejected there (`if (!payload.sessionId) return
// null`, lib/auth.ts:176). The `purpose` claim is a second, explicit check
// on top of that: verifyTrackToken never trusts a token that doesn't declare
// itself for this exact use.

import jwt from "jsonwebtoken";
import { env } from "@/lib/env";

const JWT_SECRET = env.JWT_SECRET;
const PURPOSE = "review-email-track";

export type DripStage = 1 | 2 | 3;

interface TrackTokenPayload {
  userId: string;
  stage: DripStage;
  purpose: typeof PURPOSE;
}

export function signTrackToken(userId: string, stage: DripStage): string {
  const payload: TrackTokenPayload = { userId, stage, purpose: PURPOSE };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyTrackToken(token: string): { userId: string; stage: DripStage } | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as Partial<TrackTokenPayload>;
    if (payload.purpose !== PURPOSE || !payload.userId || !payload.stage) return null;
    return { userId: payload.userId, stage: payload.stage };
  } catch {
    return null;
  }
}
