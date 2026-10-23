import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

// The CSP has no 'unsafe-eval' (lib/csp.ts). Zod v4 probes for it with
// `Function("")` the first time it parses an object; the probe is caught, so
// parsing still works, but every page that parses anything filed a CSP
// violation report. jitless skips the probe and the JIT it gates.
z.config({ jitless: true });

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});
