import { ApiError, NetworkError } from "@clipiro/shared";
import { useCallback, useRef, useState } from "react";
import { GoogleSignInFailed } from "@/lib/google";

/** A friendly line for anything an auth call can throw. */
export function authErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 429) return "Too many attempts. Wait a minute and try again.";
    return e.message;
  }
  if (e instanceof NetworkError || e instanceof GoogleSignInFailed) return e.message;
  return "Something went wrong. Please try again.";
}

// Submit-button state for the auth forms: one request at a time, and errors
// split into a field message (the server named a field) or a banner (the
// rest — with retry when it was the network). `fieldFor` lets a screen pin
// an error the server didn't attach to a field (e.g. 409 → email).
export function useSubmit(fieldFor?: (e: ApiError) => string | undefined) {
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState<{ message: string; retry: boolean } | null>(null);
  const [serverField, setServerField] = useState<Record<string, string>>({});
  const inFlight = useRef(false);

  const run = useCallback(
    async (action: () => Promise<void>, onError?: (e: unknown) => boolean) => {
      if (inFlight.current) return; // double tap
      inFlight.current = true;
      setPending(true);
      setBanner(null);
      setServerField({});
      try {
        await action();
      } catch (e) {
        if (onError?.(e)) return; // the screen handled it
        const field = e instanceof ApiError ? fieldFor?.(e) : undefined;
        if (e instanceof ApiError && Object.keys(e.fields).length) setServerField(e.fields);
        else if (field) setServerField({ [field]: authErrorMessage(e) });
        else setBanner({ message: authErrorMessage(e), retry: e instanceof NetworkError });
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [fieldFor],
  );

  return { pending, banner, serverField, run, clearBanner: () => setBanner(null) };
}
