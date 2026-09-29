// Scoped to just the /dashboard/* subtree — not the root layout — so the
// public marketing site keeps static generation instead of being forced
// dynamic by AppShellLayout's per-request cookie read, which it doesn't need.
//
// Actual chrome (header, icon rail, pathname-based active state) lives in
// DashboardShell, wrapped by the shared AppShellLayout (also used by
// app/billing/layout.tsx so /billing gets the same chrome).

import type { Metadata } from "next";
import AppShellLayout from "@/app/components/AppShellLayout";

// Signed-in app pages are never search results (robots.txt disallows the
// crawl; this stops a linked URL from being indexed anyway).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShellLayout>{children}</AppShellLayout>;
}
