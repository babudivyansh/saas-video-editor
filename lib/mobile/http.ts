import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";
import { convertToMobileSession, getAuthUser, requireSubscriber, verifyToken, type MobileTokens, type TokenPayload } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Shared plumbing for /api/mobile/v1. Routes validate with @clipiro/shared's
// zod schemas, answer errors as { error, code?, fields? }, and send no
// cookies: the app keeps its tokens in the Android Keystore.

export function mobileError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export function mobileJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Parses the JSON body with a shared schema; a 400 with per-field messages if it doesn't fit. */
export async function parseBody<S extends z.ZodType>(req: NextRequest, schema: S): Promise<{ ok: true; data: z.infer<S> } | { ok: false; res: NextResponse }> {
  const raw = await req.json().catch(() => undefined);
  const parsed = schema.safeParse(raw ?? {});
  if (parsed.success) return { ok: true, data: parsed.data };
  const fields: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in fields)) fields[key] = issue.message;
  }
  return { ok: false, res: mobileError(400, parsed.error.issues[0]?.message ?? "Check the form", { code: "invalid_request", fields }) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- web handlers each type their own params
type WebHandler = (req: NextRequest, ctx?: any) => Promise<Response>;

/**
 * Runs an existing web route with a JSON body, so the mobile route reuses its
 * logic (validation, rate limits, emails, login tail) rather than copying it.
 * The caller's user agent and forwarding headers carry over, so rate limits
 * and the session's device/IP are the same as a direct call.
 */
export async function callWeb(
  handler: WebHandler,
  req: NextRequest,
  body: unknown,
  method = "POST",
  /** Route params for a dynamic web route ([id] segments). */
  params?: Record<string, string>,
  /** Query string for the web route (replaces the mobile request's own). */
  search?: Record<string, string>,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers = new Headers(req.headers);
  headers.delete("content-length");
  headers.delete("cookie");
  headers.set("content-type", "application/json");
  const url = new URL(req.url);
  if (search) url.search = new URLSearchParams(search).toString();
  const inner = new NextRequest(url, { method, headers, body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(body) });
  const res = await handler(inner, params ? { params: Promise.resolve(params) } : undefined);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

async function sessionUser(userId: string) {
  return prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, avatarUrl: true } });
}

/**
 * A web route's answer, made mobile: a `{ token }` success becomes a mobile
 * session (access + refresh tokens and the user); every other answer
 * (2FA step, verify-email step, errors) passes through as it was.
 */
export async function asMobileSession(result: { status: number; json: Record<string, unknown> }): Promise<NextResponse> {
  const { status, json } = result;
  if (typeof json.token !== "string") {
    // The web's own `user`/`credits` echo is not part of these answers.
    const rest = { ...json };
    delete rest.user;
    if (rest.success === true) {
      delete rest.success;
      rest.ok = true;
    }
    if (status >= 400 && typeof rest.error !== "string") rest.error = "Something went wrong";
    return mobileJson(rest, status);
  }
  const tokens = await convertToMobileSession(json.token);
  if (!tokens) return mobileError(500, "Couldn't start your session. Try again.");
  return mobileSessionResponse(tokens, status);
}

export async function mobileSessionResponse(tokens: MobileTokens, status = 200): Promise<NextResponse> {
  const user = await sessionUser(verifyToken(tokens.accessToken).userId);
  if (!user) return mobileError(401, "Account not found");
  return mobileJson({ ...tokens, user }, status);
}

/** A signed-in route: 401 without a valid Bearer session. */
export function withMobileAuth<Args extends unknown[]>(handler: (req: NextRequest, auth: TokenPayload, ...args: Args) => Promise<Response>) {
  return async (req: NextRequest, ...args: Args): Promise<Response> => {
    const auth = await getAuthUser(req);
    if (!auth) return mobileError(401, "Your session has expired. Please sign in again.", { code: "unauthorized" });
    return handler(req, auth, ...args);
  };
}

/**
 * A web message as the app may show it. Google Play doesn't let the app send
 * people to buy anything (docs/mobile/BILLING.md), so the web's "Upgrade …"
 * nudges (the free tools' daily caps say "Upgrade for 50 a day, or try again
 * tomorrow.") come out; what's left still says what happened.
 */
export function appSafeMessage(msg: string): string {
  const out = msg
    .replace(/\s*Upgrade for [^,.]+, or try again tomorrow\./gi, " Try again tomorrow.")
    .replace(/\s*(Upgrade|See plans|Choose a plan)[^.]*\./gi, "")
    .trim();
  return out || "That isn’t available on your plan.";
}

/** A web route's error answer, as a mobile error. */
export function webError(result: { status: number; json: Record<string, unknown> }) {
  const msg = appSafeMessage(typeof result.json.error === "string" ? result.json.error : "Something went wrong");
  // The web's machine-readable code (subscription_required, rate_limited…) lets the app react, not just show text.
  return mobileError(result.status, msg, typeof result.json.code === "string" ? { code: result.json.code } : {});
}

/**
 * A subscriber-only route (Social Tracker, as on the web): 402 with code
 * "subscription_required" for a signed-in user without an active plan.
 */
export function withMobileSubscriber<Args extends unknown[]>(handler: (req: NextRequest, auth: TokenPayload, ...args: Args) => Promise<Response>) {
  return withMobileAuth<Args>(async (req, auth, ...args) => {
    if (!(await requireSubscriber(req))) return mobileError(402, "Social Tracker is available on paid plans.", { code: "subscription_required" });
    return handler(req, auth, ...args);
  });
}

/** callWeb for a web route that takes a multipart upload (the audio tools). */
export async function callWebForm(handler: WebHandler, req: NextRequest, form: FormData): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers = new Headers(req.headers);
  for (const h of ["content-length", "content-type", "cookie"]) headers.delete(h); // fetch sets the multipart boundary
  const inner = new NextRequest(req.url, { method: "POST", headers, body: form });
  const res = await handler(inner);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}
