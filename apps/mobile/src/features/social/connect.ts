import { ApiError, PROVIDER_LABEL, type Provider } from "@clipiro/shared";
import * as WebBrowser from "expo-web-browser";
import { social } from "@/lib/api";

// Connecting (or reconnecting) a platform from the phone: the web's own OAuth
// connect, opened in an auth session (a Custom Tab). The server signs the
// state as "app", so its callback ends at clipiro://social?pending=… (or
// ?error=…), which closes the session and hands the result back here. A
// pending connect is finished with this app's own session (completeConnect):
// the Custom Tab has none of the site's cookies, so that is what proves the
// sign-in was ours and not a link someone else started.

export const CONNECT_RETURN = "clipiro://social";

export type ConnectOutcome = { kind: "connected"; providers: Provider[] } | { kind: "failed"; message: string } | { kind: "cancelled" };

/** What the callback's `error` means, in words. */
export function connectErrorMessage(code: string, provider?: Provider): string {
  const name = provider ? PROVIDER_LABEL[provider] : "the platform";
  switch (code) {
    case "access_denied":
      return `You didn’t give Clipiro access to ${name}, so nothing was connected.`;
    case "invalid_state":
      return "That sign-in took too long or was already used. Try connecting again.";
    case "connect_failed":
      return `${name} signed you in, but its account couldn’t be read. Try again in a minute.`;
    default:
      return `Couldn’t connect ${name}. Try again.`;
  }
}

/** Reads clipiro://social?connected=youtube,… or ?error=… (a ?pending=… needs finishConnectReturn). */
export function readConnectReturn(params: { connected?: string | null; error?: string | null }, provider?: Provider): ConnectOutcome | null {
  if (params.connected) return { kind: "connected", providers: params.connected.split(",").filter(Boolean) as Provider[] };
  if (params.error) return { kind: "failed", message: connectErrorMessage(params.error, provider) };
  return null;
}

/** Reads a return link, finishing a ?pending=… connect on the server first. */
export async function finishConnectReturn(
  params: { connected?: string | null; error?: string | null; pending?: string | null },
  provider?: Provider,
): Promise<ConnectOutcome | null> {
  if (!params.pending) return readConnectReturn(params, provider);
  try {
    const { connected } = await social.completeConnect(params.pending);
    return { kind: "connected", providers: connected };
  } catch (e) {
    const code = e instanceof ApiError && e.code === "invalid_state" ? "invalid_state" : "connect_failed";
    return { kind: "failed", message: connectErrorMessage(code, provider) };
  }
}

export async function connectAccount(provider: Provider): Promise<ConnectOutcome> {
  const { url } = await social.connectUrl(provider);
  const r = await WebBrowser.openAuthSessionAsync(url, CONNECT_RETURN);
  if (r.type !== "success") return { kind: "cancelled" };
  return (await finishConnectReturn(queryOf(r.url), provider)) ?? { kind: "cancelled" };
}

/** A link's query as a map (React Native's URL has no working searchParams). */
export function queryOf(link: string): Record<string, string> {
  const q = link.split("?")[1]?.split("#")[0] ?? "";
  const out: Record<string, string> = {};
  for (const pair of q.split("&")) {
    if (!pair) continue;
    const [k, v = ""] = pair.split("=");
    out[decodeURIComponent(k!.replace(/\+/g, " "))] = decodeURIComponent(v.replace(/\+/g, " "));
  }
  return out;
}
