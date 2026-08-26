"use client";

// Thin per-page title setter. The auth/elevation gate and all sidebar/header
// chrome this component used to own now live in app/admin/layout.tsx, which
// mounts once per session instead of remounting (and re-running its access
// check) on every single admin navigation. Every page's call site —
// <AdminShell title="X">…</AdminShell> — is unchanged; only what happens
// inside it changed, so no page needed to be touched for this move.

import { useAdminTitle } from "./admin-title";

export default function AdminShell({ children, title }: { children: React.ReactNode; title: string }) {
  useAdminTitle(title);
  return <>{children}</>;
}
