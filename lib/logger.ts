// Minimal structured logger. Timestamps and tags every line so production
// logs are greppable instead of bare `console.*` text; errors also get piped
// to Sentry (once configured) so they don't rely on someone tailing stdout.

type LogLevel = "info" | "warn" | "error";

function write(level: LogLevel, tag: string, message: string, meta?: unknown) {
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] [${tag}] ${message}`;
  const withMeta = meta !== undefined ? `${line} ${JSON.stringify(meta)}` : line;
  if (level === "error") console.error(withMeta);
  else if (level === "warn") console.warn(withMeta);
  else console.log(withMeta);
}

export const logger = {
  info(tag: string, message: string, meta?: unknown) {
    write("info", tag, message, meta);
  },
  warn(tag: string, message: string, meta?: unknown) {
    write("warn", tag, message, meta);
  },
  error(tag: string, message: string, error?: unknown) {
    write("error", tag, message, error instanceof Error ? { message: error.message, stack: error.stack } : error);
    captureException(error, { tag, message });
  },
};

// Lazily resolved so this file has no hard dependency on @sentry/nextjs being
// installed/configured — captureException is a no-op until Sentry is set up.
function captureException(error: unknown, context: { tag: string; message: string }) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/nextjs");
    Sentry.captureException(error instanceof Error ? error : new Error(context.message), {
      tags: { source: context.tag },
    });
  } catch {
    // Sentry not installed/configured — logging to console above is enough.
  }
}
