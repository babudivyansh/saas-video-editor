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
      <body style={{ margin: 0, background: "#09090b", color: "#f4f4f5", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 16px", textAlign: "center" }}>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ marginTop: 12, color: "#a1a1aa", fontSize: 14, maxWidth: 420 }}>
            An unexpected error occurred. Please try again — if it keeps happening, contact support.
          </p>
          {error.digest && (
            <p style={{ marginTop: 8, fontSize: 12, color: "#52525b", fontFamily: "monospace" }}>Error ID: {error.digest}</p>
          )}
          <button
            onClick={reset}
            style={{ marginTop: 32, padding: "10px 20px", borderRadius: 9999, background: "#2563eb", color: "#fff", fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
