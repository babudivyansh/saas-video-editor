import { ApiError, ResponseShapeError } from "@clipiro/shared";
import { focusManager, QueryClient } from "@tanstack/react-query";
import { AppState } from "react-native";

// The app's react-query setup (mobile Phase 14).

/**
 * Retry what might work a second time (no connection, a server hiccup), twice.
 * Not an answer that won't change: not found, paid plans only, a refused
 * request, the day's limit, or a reply this app version can't read. Retrying
 * those three times kept a screen on its skeleton for about 7 s before it
 * said anything.
 */
export function shouldRetry(failures: number, error: unknown): boolean {
  if (error instanceof ResponseShapeError) return false;
  if (error instanceof ApiError && error.status < 500) return false;
  return failures < 2;
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: shouldRetry } } });
}

// "Refetch on window focus" means coming back to the app on a phone: balances,
// post statuses and notifications are fresh again when it returns.
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener("change", (state) => handleFocus(state === "active"));
  return () => sub.remove();
});
