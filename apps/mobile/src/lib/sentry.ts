import * as Sentry from "@sentry/react-native";
import type { ComponentType } from "react";

// Crash reporting (mobile Phase 15, decision R1 A): Sentry, in the same
// organisation as the web. Off unless EXPO_PUBLIC_SENTRY_DSN is set for the
// build (eas.json). Reports carry no personal data (no IP, no user, no
// request bodies), which is what docs/mobile/RELEASE.md's Data safety answers say.

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
export const sentryOn = !!DSN && !__DEV__;

if (sentryOn) {
  Sentry.init({
    dsn: DSN,
    environment: process.env.EXPO_PUBLIC_APP_ENV ?? "production",
    sendDefaultPii: false,
    // Errors only for now: performance tracing can come once there's traffic to read.
    tracesSampleRate: 0,
  });
}

/** The root layout, with Sentry's error boundary and touch breadcrumbs when it's on. */
export function withSentry<P extends object>(Component: ComponentType<P>): ComponentType<P> {
  return sentryOn ? (Sentry.wrap(Component as ComponentType<Record<string, unknown>>) as unknown as ComponentType<P>) : Component;
}
