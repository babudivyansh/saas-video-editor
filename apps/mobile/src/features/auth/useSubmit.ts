import { useCallback, useRef, useState } from "react";
import { ApiError, NetworkError, errorMessage } from "@mocks/auth";

// Submit-button state for the auth forms: one request at a time, and errors
// split into a field message (the server named a field) or a banner (the
// rest — with retry when it was the network).
export function useSubmit() {
  const [pending, setPending] = useState(false);
  const [banner, setBanner] = useState<{ message: string; retry: boolean } | null>(null);
  const [serverField, setServerField] = useState<Record<string, string>>({});
  const inFlight = useRef(false);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (inFlight.current) return; // double tap
    inFlight.current = true;
    setPending(true);
    setBanner(null);
    setServerField({});
    try {
      await action();
    } catch (e) {
      if (e instanceof ApiError && e.field) setServerField({ [e.field]: e.message });
      else setBanner({ message: errorMessage(e), retry: e instanceof NetworkError });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, []);

  return { pending, banner, serverField, run, clearBanner: () => setBanner(null) };
}
