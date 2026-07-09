"use client";

// Nested shell for /dashboard/profile/*: AccountNav (avatar/name/email +
// section links) + the active section's content. The outer chrome (header,
// icon sidebar) now comes from the parent app/dashboard/layout.tsx.

import AccountNav from "@/app/components/AccountNav";

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-7xl mx-auto px-6 pt-6 pb-8 flex gap-8 items-start">
      <AccountNav />
      <section className="flex-1 min-w-0">{children}</section>
    </div>
  );
}
