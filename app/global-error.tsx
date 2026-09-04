"use client";

// Last-resort boundary: catches errors thrown by the root layout itself,
// where app/error.tsx can't render. Must provide its own <html>/<body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#050908", color: "#F5F7F4", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 16px", textAlign: "center" }}>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ marginTop: 12, color: "#9AA49F", fontSize: 14, maxWidth: 420 }}>
            An unexpected error occurred. Please try again — if it keeps happening, contact support.
          </p>
          {error.digest && (
            <p style={{ marginTop: 8, fontSize: 12, color: "#7E8A85", fontFamily: "monospace" }}>Error ID: {error.digest}</p>
          )}
          <button
            onClick={reset}
            style={{ marginTop: 32, padding: "10px 20px", borderRadius: 9999, background: "#C8FF55", color: "#071006", fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
