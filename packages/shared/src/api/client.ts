import type { z } from "zod";
import { apiErrorSchema, authTokensSchema, type ApiErrorBody, type AuthTokens } from "../schemas/auth";

// Typed client for /api/mobile/v1. Sends the access token as Bearer, refreshes
// once on a 401 (one refresh at a time: each refresh token works once, so two
// in parallel would look like a stolen token and end the session), retries,
// and signs out if that fails. Every response is checked against its schema.

export const API_PREFIX = "/api/mobile/v1";

/** Where the app keeps its tokens (the Android Keystore via expo-secure-store). */
export interface TokenStore {
  get(): Promise<AuthTokens | null>;
  set(tokens: AuthTokens | null): Promise<void>;
}

export interface ApiClientOptions {
  baseUrl: string;
  tokens: TokenStore;
  /** Called once a session can't be refreshed: the user must sign in again. */
  onSignedOut?: () => void;
  fetch?: typeof fetch;
  /** Sent as the User-Agent, which names the device in "Sessions". */
  userAgent?: string;
}

/** A non-2xx answer, with the server's message and per-field errors. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.error);
    this.name = "ApiError";
  }
  get code() {
    return this.body.code;
  }
  get fields() {
    return this.body.fields ?? {};
  }
}

/** No answer at all (offline, DNS, timeout). */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super("No connection. Check your internet and try again.");
    this.name = "NetworkError";
    this.cause = cause;
  }
}

/** The response didn't match its schema: the app and server disagree. */
export class ResponseShapeError extends Error {
  constructor(
    readonly path: string,
    readonly issues: z.core.$ZodIssue[],
  ) {
    super(`Unexpected response from ${path}`);
    this.name = "ResponseShapeError";
  }
}

export interface RequestOptions<S extends z.ZodType> {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Validates (and types) the response. */
  schema: S;
  /** Send the access token (default true). The sign-in routes don't. */
  auth?: boolean;
  signal?: AbortSignal;
}

export function createApiClient(opts: ApiClientOptions) {
  const doFetch = opts.fetch ?? fetch;
  let refreshing: Promise<boolean> | null = null;

  async function send(path: string, method: string, body: unknown, accessToken: string | null, signal?: AbortSignal): Promise<Response> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (opts.userAgent) headers["User-Agent"] = opts.userAgent;
    try {
      return await doFetch(`${opts.baseUrl}${API_PREFIX}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new NetworkError(e);
    }
  }

  async function signOut() {
    await opts.tokens.set(null);
    opts.onSignedOut?.();
  }

  /** Swaps the refresh token for a new pair; false = signed out. Single-flight. */
  function refresh(): Promise<boolean> {
    refreshing ??= (async () => {
      try {
        const current = await opts.tokens.get();
        if (!current) return false;
        const res = await send("/auth/refresh", "POST", { refreshToken: current.refreshToken }, null);
        if (res.status === 401) {
          await signOut();
          return false;
        }
        if (!res.ok) return false; // a server hiccup: keep the tokens, fail this request
        const next = authTokensSchema.parse(await res.json());
        await opts.tokens.set(next);
        return true;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  async function request<S extends z.ZodType>(path: string, o: RequestOptions<S>): Promise<z.infer<S>> {
    const method = o.method ?? (o.body === undefined ? "GET" : "POST");
    const withAuth = o.auth ?? true;
    let token = withAuth ? ((await opts.tokens.get())?.accessToken ?? null) : null;
    let res = await send(path, method, o.body, token, o.signal);
    if (res.status === 401 && withAuth && token) {
      if (await refresh()) {
        token = (await opts.tokens.get())?.accessToken ?? null;
        res = await send(path, method, o.body, token, o.signal);
        if (res.status === 401) await signOut();
      }
    }
    const json: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = apiErrorSchema.safeParse(json);
      throw new ApiError(res.status, err.success ? err.data : { error: res.status >= 500 ? "Something went wrong on our side. Try again." : "Request failed" });
    }
    const parsed = o.schema.safeParse(json);
    if (!parsed.success) throw new ResponseShapeError(path, parsed.error.issues);
    return parsed.data;
  }

  return { request, refresh, signOut };
}

export type ApiClient = ReturnType<typeof createApiClient>;
