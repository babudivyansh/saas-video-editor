"use client";

// Shared shell for the whole account section: ToolsSidebar (app-wide rail) +
// AccountNav (avatar/name/email + section links) + the active section's content.

import ToolsSidebar from "@/app/components/ToolsSidebar";
import AccountNav from "@/app/components/AccountNav";

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <ToolsSidebar active="profile" />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-8 flex gap-8 items-start">
          <AccountNav />
          <section className="flex-1 min-w-0">{children}</section>
        </div>
      </main>
    </div>
  );
}
