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
import { isSuppressed, logEmail } from "./suppression";
import { LEGAL, PRODUCT_NAME } from "./tokens";

export interface SendResult {
  status: "sent" | "suppressed" | "skipped-optout" | "dev-logged" | "failed";
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

/**
 * Boot-time check for the misconfiguration that caused two real outages.
 *
 * `onboarding@resend.dev` is Resend's own shared sandbox address. It is
 * ALWAYS restricted to the account owner's inbox — regardless of any other
 * domain being verified on the account — so falling back to it in a
 * deployment with real recipients means every non-owner send comes back a
 * 403. Both incidents took a production log paste plus a round trip through
 * the Resend MCP to diagnose, because the only visible symptom was the 403
 * itself; nothing said WHY the wrong address was in use.
 *
 * Runs once per process, at import time, specifically so it appears in the
 * deploy's boot log — before any user has to trigger a send and hit the
 * failure — rather than only being discoverable by reading a stack trace
 * after the fact. It is a loud diagnostic, not a guard: EMAIL_FROM being
 * unset is legitimate in local dev, so this never blocks a send.
 */
if (env.RESEND_API_KEY && !env.EMAIL_FROM) {
  logger.error(
    "email:config",
    "RESEND_API_KEY is set but EMAIL_FROM is not. Every send will use the " +
      "onboarding@resend.dev fallback, which Resend restricts to the " +
      "account owner's own address no matter which domains are verified — " +
      "every other recipient will get a 403. Set EMAIL_FROM in this " +
      "deployment's environment (e.g. noreply@clipiro.com) and restart.",
  );
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
type ResendOutcome = { ok: true; id: string } | { ok: false; status: number; body: string };

async function viaResend(p: Payload): Promise<{ id: string }> {
  const outcome = await withRetry<ResendOutcome>(
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

      // A 4xx is RETURNED, never thrown. withRetry retries every throw, so the
      // previous "NonRetryableError" was retried three times despite its name —
      // production logs showed a 403 for an unverified domain going round the
      // loop and only then falling through to SMTP, delaying every message by
      // the full backoff for an answer that could not change.
      if (res.status >= 400 && res.status < 500) {
        return { ok: false, status: res.status, body: (await res.text().catch(() => "")).slice(0, 300) };
      }
      // 5xx and network faults are genuinely transient, so these DO throw and
      // are retried.
      if (!res.ok) throw new Error(`Resend responded ${res.status}`);

      const { id } = (await res.json()) as { id: string };
      return { ok: true, id };
    },
    { maxAttempts: 3, timeoutMs: TIMEOUT_MS, baseDelayMs: 500 },
  );

  if (!outcome.ok) throw new ResendRejectedError(outcome.status, outcome.body);
  return { id: outcome.id };
}

/** A provider refusal that will fail identically however often it is retried. */
export class ResendRejectedError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Resend rejected the message (${status}): ${body}`);
    this.name = "ResendRejectedError";
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

    // Suppression comes before everything, including transactional mail. A hard
    // bounce means the mailbox does not exist, so a receipt sent there is not
    // reaching anyone either — it only damages the sending domain's reputation.
    // A spam complaint is a stronger signal still.
    if (await isSuppressed(to)) {
      await logEmail({ recipient: to, templateId: id, status: "suppressed" });
      return { status: "suppressed", channel: null, messageId: null };
    }

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
        await logEmail({ recipient: to, templateId: id, status: "skipped-optout", userId });
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

    // Remembered so a provider REFUSAL is never reported as "no provider
    // configured". Without this, a Resend 403 with no SMTP fallback returned
    // "dev-logged" — the one status that means "nothing was configured to send
    // with" — which is the same silent-success failure SendResult exists to
    // eliminate, just one level down.
    let providerError: string | undefined;

    if (env.RESEND_API_KEY) {
      try {
        const { id: messageId } = await viaResend(payload);
        await logEmail({
          recipient: to, templateId: id, status: "sent", channel: "resend", providerMessageId: messageId, userId,
        });
        return { status: "sent", channel: "resend", messageId };
      } catch (err) {
        // Fall through to SMTP — but say so, because a silent provider failure
        // is exactly what made the old transport untrustworthy.
        providerError = err instanceof Error ? err.message : String(err);
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
      await logEmail({
        recipient: to, templateId: id, status: "sent", channel: "smtp",
        providerMessageId: info.messageId ?? null, userId,
      });
      return { status: "sent", channel: "smtp", messageId: info.messageId ?? null };
    }

    // A provider was configured and refused. That is a failure, not a
    // dev-console send, and the provider's own words are carried through so the
    // reason is visible in EmailLog rather than only in a server log.
    if (providerError) {
      await logEmail({ recipient: to, templateId: id, status: "failed", error: providerError, userId });
      return { status: "failed", channel: null, messageId: null, error: providerError };
    }

    // Genuinely nothing configured. Reported as its own status rather than as
    // success, so a misconfigured deploy is visible instead of looking like it
    // worked.
    logger.info("email:dev", `${id} -> ${to} :: ${payload.subject}`);
    await logEmail({ recipient: to, templateId: id, status: "dev-logged", channel: "dev-console", userId });
    return { status: "dev-logged", channel: "dev-console", messageId: null };
  } catch (err) {
    logger.error("email:send", `${id} -> ${to} failed`, err);
    const error = err instanceof Error ? err.message : String(err);
    await logEmail({ recipient: to, templateId: id, status: "failed", error });
    return { status: "failed", channel: null, messageId: null, error };
  }
}
