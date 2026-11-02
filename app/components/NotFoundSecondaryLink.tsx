"use client";

import Link from "next/link";
import { useAuth } from "@/app/components/AuthContext";

// The 404 page's second button: "Dashboard" for a signed-in visitor, "See
// pricing" for everyone else (a dashboard means nothing to someone who has
// never signed up). Decided on the client: reading the session cookie in the
// server component made the root not-found boundary — and with it every route
// in the app — dynamic, so no marketing page could be prerendered or cached.
export default function NotFoundSecondaryLink() {
  const { user } = useAuth();
  return (
    <Link
      href={user ? "/dashboard" : "/pricing"}
      className="px-5 py-2.5 rounded-full border border-line hover:border-line-strong text-fg-muted hover:text-fg text-sm font-semibold transition-colors"
    >
      {user ? "Dashboard" : "See pricing"}
    </Link>
  );
}
