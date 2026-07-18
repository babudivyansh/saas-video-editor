// Shared User-Agent → human-readable device label, extracted from the
// heuristic that used to live inline in app/api/auth/login/route.ts so
// LoginEvent creation and the multi-session list (lib/auth.ts) describe a
// device identically instead of drifting. Deliberately not a dependency
// (no ua-parser-js) — a handful of substring checks covers the OS/browser
// combinations that matter for "which of my devices is this" at a glance;
// a misclassified rare browser degrades to "Unknown device", never a crash.

export function describeDevice(userAgent: string): string {
  const ua = userAgent || "";
  const isMobile = /Mobile|Android|iPhone/i.test(ua);
  const os = /Windows/i.test(ua) ? "Windows"
    : /Mac OS X/i.test(ua) ? "macOS"
    : /iPhone|iPad|iOS/i.test(ua) ? "iOS"
    : /Android/i.test(ua) ? "Android"
    : /Linux/i.test(ua) ? "Linux"
    : null;
  const browser = /Edg\//i.test(ua) ? "Edge"
    : /OPR\//i.test(ua) ? "Opera"
    : /Chrome\//i.test(ua) ? "Chrome"
    : /Firefox\//i.test(ua) ? "Firefox"
    : /Safari\//i.test(ua) ? "Safari"
    : null;

  if (browser && os) return `${browser} on ${os}`;
  if (browser) return isMobile ? `${browser} (Mobile)` : browser;
  if (os) return os;
  return "Unknown device";
}
