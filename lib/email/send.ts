// The transport. Renders a registered template and delivers it.
//
// Replaces the private sendEmail() in lib/email.ts, which had three problems
// worth naming because this file exists to fix them:
//
//  1. It returned void and RESOLVED even when nothing was sent — with no Resend
//     key and no SMTP user it logged and reported success, so no caller could
//     tell "delivered" from "silently dropped". SendResult makes that explicit.
//  2. No retries, despite lib/with-retry.ts existing and being used elsewhere.
//  3. HTML only. Every message now carries a text/plain part, produced from the
//     same blocks as the HTML.
//
// It also absorbs two things that were previously hand-written at each call
// site: the notification opt-out check, and the unsubscribe link and headers.
// Driving both from the registry's `category` is what makes it impossible to
// ship a marketing email with no way out of it.

import nodemailer from "nodemailer";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { withRetry } from "@/lib/with-retry";
import { shouldSendCategory } from "@/lib/notifications";
import { renderEmail, type LocaleCode } from "./layout";
import { EMAIL_REGISTRY } from "./templates/registry";
import { unsubscribeUrl } from "./unsubscribe";
import { LEGAL, PRODUCT_NAME } from "./tokens";

export interface SendResult {
  status: "sent" | "skipped-optout" | "dev-logged" | "failed";
  channel: "resend" | "smtp" | "dev-console" | null;
  messageId: string | null;
  error?: string;
}

export interface SendOptions {
  /** Required for any non-transactional email — drives opt-out and unsubscribe. */
  userId?: string;
  locale?: LocaleCode;
  replyTo?: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

/** Lazily built so importing this module never opens a connection. */
let transporter: nodemailer.Transporter | null = null;
function smtp(): nodemailer.Transporter {
  transporter ??= nodemailer.createTransport({
    host: env.EMAIL_HOST || "smtp.gmail.com",
    port: Number(env.EMAIL_PORT) || 587,
    secure: Number(env.EMAIL_PORT) === 465,
    // The old transport left this off with no requireTLS, so a downgrade was
    // possible on a hostile network. STARTTLS is now mandatory on 587.
    requireTLS: Number(env.EMAIL_PORT) !== 465,
    auth: { user: env.EMAIL_USER, pass: env.EMAIL_PASS },
  });
  return transporter;
}

function fromAddress(): string {
  return env.EMAIL_FROM || "onboarding@resend.dev";
}

interface Payload {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  replyTo?: string;
}

/**
 * Resend over raw fetch rather than the SDK.
 *
 * The SDK's emails.send accepts no AbortSignal, so withRetry's hard per-attempt
 * timeout — the entire reason it exists — would be inert. A direct POST gives
 * real cancellation and hands back the provider message id.
 */
async function viaResend(p: Payload): Promise<{ id: string }> {
  return withRetry(
    async (signal) => {
      const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        signal,
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${PRODUCT_NAME} <${fromAddress()}>`,
          to: [p.to],
          subject: p.subject,
          html: p.html,
          text: p.text,
          headers: p.headers,
          ...(p.replyTo ? { reply_to: p.replyTo } : {}),
        }),
      });

      // 4xx is a bad request — a malformed address, a rejected domain. Retrying
      // it just burns the timeout budget three times over, so it is returned as
      // a rejection that withRetry will surface after the FIRST attempt only if
      // we throw a non-retryable marker. Simpler: throw, but never for 4xx.
      if (res.status >= 400 && res.status < 500) {
        const body = await res.text().catch(() => "");
        throw new NonRetryableError(`Resend rejected the message (${res.status}): ${body.slice(0, 200)}`);
      }
      if (!res.ok) throw new Error(`Resend responded ${res.status}`);

      return (await res.json()) as { id: string };
    },
    { maxAttempts: 3, timeoutMs: TIMEOUT_MS, baseDelayMs: 500 },
  );
}

/** Thrown for provider responses that will fail identically on every retry. */
class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableError";
  }
}

/**
 * Map a recipient address to a user id, for the unsubscribe link.
 *
 * Returns undefined for an address with no account — a newsletter subscriber,
 * say — which correctly yields no per-category unsubscribe link, since there are
 * no preferences to toggle. Never throws: a failed lookup must not stop a send.
 */
async function resolveUserId(email: string): Promise<string | undefined> {
  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    return user?.id;
  } catch (err) {
    logger.error("email:send", `could not resolve user for ${email}`, err);
    return undefined;
  }
}

/**
 * Send one registered template.
 *
 * NEVER THROWS. Several callers fire this without awaiting — lib/credit-events.ts
 * does it in a bare IIFE — so a rejection here would surface as an unhandled
 * promise rejection and, on some runtimes, take the process down.
 */
export async function sendTemplate<P>(
  id: string,
  to: string,
  props: P,
  opts: SendOptions = {},
): Promise<SendResult> {
  const entry = EMAIL_REGISTRY[id];
  if (!entry) {
    logger.error("email:send", `unknown template "${id}"`);
    return { status: "failed", channel: null, messageId: null, error: `unknown template "${id}"` };
  }

  try {
    // Narrowed to null rather than tested via a boolean: a separate `const
    // transactional = …` does not narrow entry.category for the compiler, and
    // shouldSendCategory only accepts a real NotificationCategory.
    const optOutCategory = entry.category === "transactional" ? null : entry.category;
    const transactional = optOutCategory === null;

    // An unsubscribe link needs a user id, but the 41 existing call sites pass
    // only an address — sendWelcomeEmail(to, name, credits) and friends. Rather
    // than change 39 signatures, resolve it here.
    //
    // Bounded deliberately: only for non-transactional mail (14 of 41), only
    // when the caller did not already supply it, and it is a single lookup on a
    // unique indexed column. A marketing email with no unsubscribe route is the
    // thing this system exists to prevent, so one query is a fair price.
    const userId = opts.userId ?? (transactional ? undefined : await resolveUserId(to));

    // Opt-out gate. Only meaningful when we know who this is; an address with no
    // user (a newsletter confirmation) has no preferences to consult.
    if (optOutCategory && userId) {
      const allowed = await shouldSendCategory(userId, optOutCategory);
      if (!allowed) {
        return { status: "skipped-optout", channel: null, messageId: null };
      }
    }

    const unsubUrl = optOutCategory && userId ? unsubscribeUrl(userId, optOutCategory) : undefined;

    const doc = entry.build(props as never);
    const rendered = renderEmail({
      ...doc,
      locale: opts.locale ?? doc.locale,
      unsubscribeUrl: unsubUrl,
      accent: transactional ? "plain" : "brand",
    });

    const headers: Record<string, string> = {};
    if (rendered.listUnsubscribe) {
      headers["List-Unsubscribe"] = `<${rendered.listUnsubscribe.http}>, <${rendered.listUnsubscribe.mailto}>`;
      // Without this, Gmail and Yahoo treat the header as a plain link rather
      // than a one-click action, which is what their bulk-sender rules require.
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }

    const payload: Payload = {
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers,
      replyTo: opts.replyTo ?? LEGAL.supportEmail,
    };

    if (env.RESEND_API_KEY) {
      try {
        const { id: messageId } = await viaResend(payload);
        return { status: "sent", channel: "resend", messageId };
      } catch (err) {
        // Fall through to SMTP — but say so, because a silent provider failure
        // is exactly what made the old transport untrustworthy.
        logger.error("email:resend", `${id} -> ${to} failed`, err);
      }
    }

    if (env.EMAIL_USER) {
      const info = await smtp().sendMail({
        from: `"${PRODUCT_NAME}" <${env.EMAIL_FROM || env.EMAIL_USER}>`,
        to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        replyTo: payload.replyTo,
        headers: payload.headers,
      });
      return { status: "sent", channel: "smtp", messageId: info.messageId ?? null };
    }

    // No provider configured. Reported as its own status rather than as success,
    // so a misconfigured deploy is visible instead of looking like it worked.
    logger.info("email:dev", `${id} -> ${to} :: ${payload.subject}`);
    return { status: "dev-logged", channel: "dev-console", messageId: null };
  } catch (err) {
    logger.error("email:send", `${id} -> ${to} failed`, err);
    return {
      status: "failed",
      channel: null,
      messageId: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
