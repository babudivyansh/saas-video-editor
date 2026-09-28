// Taking ownership of an account whose email was never verified.
//
// Until 2026-09-28 signup never checked the address, so anyone could register
// someone else's email, set the password, even turn on 2FA — then wait. When
// the real owner later proved the inbox (Sign in with Google, an emailed
// sign-in code, a password reset) they were logged into that account while
// the squatter still held a working password, live sessions and possibly the
// second factor. Classic pre-registration takeover.
//
// So the first time an unverified account is verified by a flow that did NOT
// also prove its password, every credential the squatter could have planted
// is thrown away. The person who controls the inbox is, by definition, the
// owner — and can set a password with forgot-password.

import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { invalidateAllSessions } from "@/lib/auth";

export interface ClaimOptions {
  /**
   * The new password hash to keep, when the verifying flow set one itself
   * (reset-password). Omitted: the password is replaced with an unknown
   * random value and hasPassword goes false.
   */
  passwordHash?: string;
}

export async function claimUnverifiedAccount(userId: string, opts: ClaimOptions = {}): Promise<void> {
  const passwordHash = opts.passwordHash ?? (await bcrypt.hash(randomBytes(32).toString("hex"), 12));

  await prisma.$transaction([
    prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: {
        emailVerifiedAt: new Date(),
        passwordHash,
        hasPassword: !!opts.passwordHash,
        twoFactorEnabled: false,
        twoFactorSecretEnc: null,
        twoFactorLastUsedStep: null,
      },
    }),
  ]);

  await invalidateAllSessions(userId);
}
