// Thin fetch wrapper shared by every Assets hook — consistent bearer-auth
// header and consistent error surfacing (audit finding: the old page called
// fetch() ad hoc per handler and silently swallowed every non-ok response).

export class AssetApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function assetsFetch<T = unknown>(
  path: string,
  token: string | null,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  let data: unknown = null;
  try { data = await res.json(); } catch { /* empty/non-JSON body */ }

  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new AssetApiError(message, res.status, data);
  }
  return data as T;
}
