import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";

// Next.js startup hook: validate required env vars fail-fast, initialize
// Sentry (no-op unless SENTRY_DSN is set), and on the Node.js runtime start
// the workers (instrumentation-node.ts).
//
// Node-only code must be imported inside `if (process.env.NEXT_RUNTIME ===
// "nodejs")`, Next's documented pattern: Next replaces that condition at
// compile time and leaves the import out of the Edge build. Imported after an
// early `return` instead, it was compiled for Edge too — the whole render
// stack, a second time, erroring on Node APIs — which kept `next dev` from
// answering its first request for a minute or more.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./lib/env");
    validateEnv();
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    enabled: !!process.env.SENTRY_DSN,
  });

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNode } = await import("./instrumentation-node");
    await registerNode();
  }
}

export const onRequestError: Instrumentation.onRequestError = Sentry.captureRequestError;
